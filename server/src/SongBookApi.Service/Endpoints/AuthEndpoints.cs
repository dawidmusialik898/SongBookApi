using System.Security.Claims;
using System.Text;
using System.ComponentModel.DataAnnotations;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.WebUtilities;
using SongBookApi.Infrastructure.Identity;
using SongBookApi.Service.Authentication;
using SongBookApi.Service.Contracts;

namespace SongBookApi.Service.Endpoints;

public static class AuthEndpoints
{
    private const string GenericEmailResponse = "If the account is eligible, an email was sent.";

    public static void MapAuthEndpoints(this WebApplication app)
    {
        RouteGroupBuilder auth = app.MapGroup("/auth");

        _ = auth.MapGet("/antiforgery", GetAntiforgeryToken);
        _ = auth.MapGet("/me", GetCurrentUser);
        _ = auth.MapPost("/register", Register)
            .RequireRateLimiting("email")
            .AddEndpointFilter<AntiforgeryValidationFilter>();
        _ = auth.MapGet("/confirm-email", ConfirmEmail);
        _ = auth.MapPost("/resend-confirmation", ResendConfirmation)
            .RequireRateLimiting("email")
            .AddEndpointFilter<AntiforgeryValidationFilter>();
        _ = auth.MapPost("/login", Login)
            .RequireRateLimiting("login")
            .AddEndpointFilter<AntiforgeryValidationFilter>();
        _ = auth.MapPost("/logout", Logout)
            .RequireAuthorization(AuthConstants.AuthenticatedUserPolicy)
            .AddEndpointFilter<AntiforgeryValidationFilter>();
        _ = auth.MapPost("/forgot-password", ForgotPassword)
            .RequireRateLimiting("email")
            .AddEndpointFilter<AntiforgeryValidationFilter>();
        _ = auth.MapPost("/reset-password", ResetPassword)
            .AddEndpointFilter<AntiforgeryValidationFilter>();
    }

    private static IResult GetAntiforgeryToken(HttpContext context, IAntiforgery antiforgery)
    {
        AntiforgeryTokenSet tokens = antiforgery.GetAndStoreTokens(context);
        context.Response.Headers.CacheControl = "no-store";
        return Results.Ok(new AntiforgeryTokenResponse(tokens.RequestToken!));
    }

    private static async Task<IResult> GetCurrentUser(
        ClaimsPrincipal principal,
        UserManager<ApplicationUser> userManager)
    {
        if (principal.Identity?.IsAuthenticated != true)
        {
            return Results.Ok(new AuthenticatedUserResponse(false, null, null));
        }

        ApplicationUser? user = await userManager.GetUserAsync(principal);
        return Results.Ok(new AuthenticatedUserResponse(
            user is not null,
            user is null ? null : await userManager.GetEmailAsync(user),
            user is null ? null : principal.IsInRole(AuthConstants.SuperUserRole)
                ? "superuser"
                : principal.IsInRole(AuthConstants.ModeratorRole)
                    ? "moderator"
                    : "user"));
    }

    private static async Task<IResult> Register(
        RegisterRequest request,
        AccountLinkBuilder accountLinks,
        UserManager<ApplicationUser> userManager,
        IAccountEmailSender emailSender)
    {
        if (!TryGetEmail(request.Email, out string email) || string.IsNullOrWhiteSpace(request.Password))
        {
            return ValidationProblem("email", "A valid email and password are required.");
        }

        ApplicationUser user = new() { UserName = email, Email = email };
        IdentityResult result = await userManager.CreateAsync(user, request.Password);
        if (!result.Succeeded)
        {
            return IdentityValidationProblem(result);
        }

        string code = EncodeToken(await userManager.GenerateEmailConfirmationTokenAsync(user));
        string link = accountLinks.BuildLink("/auth/confirm-email", new Dictionary<string, string?>
        {
            ["userId"] = user.Id,
            ["code"] = code
        });
        await emailSender.SendConfirmationLinkAsync(email, link);
        return Results.Accepted(value: new { message = GenericEmailResponse });
    }

    private static async Task<IResult> ConfirmEmail(
        string? userId,
        string? code,
        UserManager<ApplicationUser> userManager,
        IConfiguration configuration)
    {
        if (string.IsNullOrWhiteSpace(userId) || !TryDecodeToken(code, out string token))
        {
            return Results.Redirect("/?auth=confirmation-failed");
        }

        ApplicationUser? user = await userManager.FindByIdAsync(userId);
        if (user is null)
        {
            return Results.Redirect("/?auth=confirmation-failed");
        }

        IdentityResult result = await userManager.ConfirmEmailAsync(user, token);
        if (result.Succeeded)
        {
            await ModerationBootstrap.PromoteConfirmedUserAsync(configuration, userManager);
        }
        return Results.Redirect(result.Succeeded
            ? "/?auth=confirmed"
            : "/?auth=confirmation-failed");
    }

    private static async Task<IResult> ResendConfirmation(
        EmailRequest request,
        AccountLinkBuilder accountLinks,
        UserManager<ApplicationUser> userManager,
        IAccountEmailSender emailSender)
    {
        if (TryGetEmail(request.Email, out string email))
        {
            ApplicationUser? user = await userManager.FindByEmailAsync(email);
            if (user is not null && !await userManager.IsEmailConfirmedAsync(user))
            {
                string code = EncodeToken(await userManager.GenerateEmailConfirmationTokenAsync(user));
                string link = accountLinks.BuildLink("/auth/confirm-email", new Dictionary<string, string?>
                {
                    ["userId"] = user.Id,
                    ["code"] = code
                });
                await emailSender.SendConfirmationLinkAsync(email, link);
            }
        }

        return Results.Accepted(value: new { message = GenericEmailResponse });
    }

    private static async Task<IResult> Login(
        LoginRequest request,
        UserManager<ApplicationUser> userManager,
        SignInManager<ApplicationUser> signInManager)
    {
        if (!TryGetEmail(request.Email, out string email) || string.IsNullOrEmpty(request.Password))
        {
            return Results.Unauthorized();
        }

        ApplicationUser? user = await userManager.FindByEmailAsync(email);
        if (user is null || user.IsBanned)
        {
            return Results.Unauthorized();
        }

        SignInResult result = await signInManager.PasswordSignInAsync(
            user,
            request.Password,
            request.RememberMe,
            lockoutOnFailure: true);
        return result.Succeeded ? Results.NoContent() : Results.Unauthorized();
    }

    private static async Task<IResult> Logout(SignInManager<ApplicationUser> signInManager)
    {
        await signInManager.SignOutAsync();
        return Results.NoContent();
    }

    private static async Task<IResult> ForgotPassword(
        EmailRequest request,
        AccountLinkBuilder accountLinks,
        UserManager<ApplicationUser> userManager,
        IAccountEmailSender emailSender)
    {
        if (TryGetEmail(request.Email, out string email))
        {
            ApplicationUser? user = await userManager.FindByEmailAsync(email);
            if (user is not null && await userManager.IsEmailConfirmedAsync(user))
            {
                string code = EncodeToken(await userManager.GeneratePasswordResetTokenAsync(user));
                string link = accountLinks.BuildLink("/", new Dictionary<string, string?>
                {
                    ["auth"] = "reset-password",
                    ["email"] = email,
                    ["code"] = code
                });
                await emailSender.SendPasswordResetLinkAsync(email, link);
            }
        }

        return Results.Accepted(value: new { message = GenericEmailResponse });
    }

    private static async Task<IResult> ResetPassword(
        ResetPasswordRequest request,
        UserManager<ApplicationUser> userManager)
    {
        if (!TryGetEmail(request.Email, out string email) ||
            !TryDecodeToken(request.Code, out string token) ||
            string.IsNullOrWhiteSpace(request.NewPassword))
        {
            return ValidationProblem("code", "The password reset request is invalid.");
        }

        ApplicationUser? user = await userManager.FindByEmailAsync(email);
        if (user is null)
        {
            return ValidationProblem("code", "The password reset request is invalid.");
        }

        IdentityResult result = await userManager.ResetPasswordAsync(user, token, request.NewPassword);
        return result.Succeeded ? Results.NoContent() : IdentityValidationProblem(result);
    }

    private static bool TryGetEmail(string? value, out string email)
    {
        email = value?.Trim() ?? string.Empty;
        return !string.IsNullOrWhiteSpace(email) && new EmailAddressAttribute().IsValid(email);
    }

    private static string EncodeToken(string token) =>
        WebEncoders.Base64UrlEncode(Encoding.UTF8.GetBytes(token));

    private static bool TryDecodeToken(string? encodedToken, out string token)
    {
        token = string.Empty;
        if (string.IsNullOrWhiteSpace(encodedToken))
        {
            return false;
        }

        try
        {
            token = Encoding.UTF8.GetString(WebEncoders.Base64UrlDecode(encodedToken));
            return true;
        }
        catch (FormatException)
        {
            return false;
        }
    }

    private static IResult IdentityValidationProblem(IdentityResult result)
    {
        Dictionary<string, string[]> errors = result.Errors
            .GroupBy(error => error.Code)
            .ToDictionary(group => group.Key, group => group.Select(error => error.Description).ToArray());
        return Results.ValidationProblem(errors);
    }

    private static IResult ValidationProblem(string key, string error) =>
        Results.ValidationProblem(new Dictionary<string, string[]> { [key] = [error] });
}
