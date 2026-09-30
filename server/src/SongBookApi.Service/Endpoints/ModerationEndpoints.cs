using System.Security.Claims;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using SongBookApi.Domain;
using SongBookApi.Infrastructure.Identity;
using SongBookApi.Service.Authentication;
using SongBookApi.Service.Contracts;

namespace SongBookApi.Service.Endpoints;

public static class ModerationEndpoints
{
    private const string AuditLogCategory = "SongBookApi.Moderation";

    public static void MapModerationEndpoints(this WebApplication app)
    {
        RouteGroupBuilder users = app.MapGroup("/admin/users")
            .RequireAuthorization(AuthConstants.ModeratorPolicy);

        users.MapGet("", List);
        users.MapPut("/{userId:guid}/role", SetRole)
            .RequireAuthorization(AuthConstants.SuperUserPolicy)
            .AddEndpointFilter<AntiforgeryValidationFilter>();
        users.MapPut("/{userId:guid}/ban", SetBan)
            .AddEndpointFilter<AntiforgeryValidationFilter>();
        users.MapDelete("/{userId:guid}", Delete)
            .AddEndpointFilter<AntiforgeryValidationFilter>();
    }

    private static async Task<IResult> List(
        ClaimsPrincipal principal,
        SongBookDbContext dbContext,
        int page = 1)
    {
        IResult? invalidPage = EndpointHelpers.ValidatePage(page);
        if (invalidPage is not null)
        {
            return invalidPage;
        }

        string callerId = EndpointHelpers.GetUserId(principal);
        var users = await dbContext.Users.AsNoTracking()
            .Where(user => user.Id != callerId)
            .OrderBy(user => user.NormalizedEmail)
            .ThenBy(user => user.Id)
            .Skip(Paging.Offset(page))
            .Take(Paging.Size + 1)
            .Select(user => new { user.Id, user.Email, user.IsBanned, user.EmailConfirmed })
            .ToListAsync();
        var visibleUsers = users.Take(Paging.Size).ToArray();
        string[] userIds = visibleUsers.Select(user => user.Id).ToArray();
        var assignments = await dbContext.UserRoles
            .Where(assignment => userIds.Contains(assignment.UserId))
            .Join(dbContext.Roles, assignment => assignment.RoleId,
                role => role.Id, (assignment, role) => new { assignment.UserId, role.Name })
            .ToListAsync();
        ILookup<string, string?> rolesByUser = assignments.ToLookup(
            assignment => assignment.UserId, assignment => assignment.Name);

        return Results.Ok(new PageResult<ModeratedUserResponse>(
            visibleUsers.Select(user => new ModeratedUserResponse(
                user.Id,
                user.Email,
                rolesByUser[user.Id].Contains(AuthConstants.SuperUserRole)
                    ? "superuser"
                    : rolesByUser[user.Id].Contains(AuthConstants.ModeratorRole)
                        ? "moderator"
                        : "user",
                user.IsBanned,
                user.EmailConfirmed)).ToArray(),
            page,
            users.Count > Paging.Size));
    }

    private static async Task<IResult> SetRole(
        Guid userId,
        SetUserRoleRequest request,
        ClaimsPrincipal principal,
        UserManager<ApplicationUser> userManager,
        SongBookDbContext dbContext,
        ILoggerFactory loggerFactory)
    {
        if (request.Role is not ("user" or "moderator"))
        {
            return ValidationProblem("role", "Role must be user or moderator.");
        }

        (ApplicationUser? target, IResult? denial) = await GetManageableUserAsync(
            userId, principal, userManager);
        if (denial is not null)
        {
            return denial;
        }

        bool isModerator = await userManager.IsInRoleAsync(target!, AuthConstants.ModeratorRole);
        if (request.Role == "moderator" && (!target!.EmailConfirmed || target.IsBanned))
        {
            return ValidationProblem("role", "Only a confirmed, active account can become a moderator.");
        }
        if (isModerator == (request.Role == "moderator"))
        {
            return Results.NoContent();
        }

        await using var transaction = await dbContext.Database.BeginTransactionAsync();
        EnsureSucceeded(request.Role == "moderator"
            ? await userManager.AddToRoleAsync(target!, AuthConstants.ModeratorRole)
            : await userManager.RemoveFromRoleAsync(target!, AuthConstants.ModeratorRole));
        EnsureSucceeded(await userManager.UpdateSecurityStampAsync(target!));
        await transaction.CommitAsync();
        loggerFactory.CreateLogger(AuditLogCategory).LogInformation(
            "User {ActorId} changed role of {TargetId} to {Role}",
            EndpointHelpers.GetUserId(principal), target!.Id, request.Role);
        return Results.NoContent();
    }

    private static async Task<IResult> SetBan(
        Guid userId,
        SetUserBanRequest request,
        ClaimsPrincipal principal,
        UserManager<ApplicationUser> userManager,
        SongBookDbContext dbContext,
        ILoggerFactory loggerFactory)
    {
        if (request.IsBanned is null)
        {
            return ValidationProblem("isBanned", "A ban state is required.");
        }

        (ApplicationUser? target, IResult? denial) = await GetManageableUserAsync(
            userId, principal, userManager);
        if (denial is not null)
        {
            return denial;
        }
        if (target!.IsBanned == request.IsBanned.Value)
        {
            return Results.NoContent();
        }

        await using var transaction = await dbContext.Database.BeginTransactionAsync();
        target.IsBanned = request.IsBanned.Value;
        EnsureSucceeded(await userManager.UpdateAsync(target));
        EnsureSucceeded(await userManager.UpdateSecurityStampAsync(target));
        await transaction.CommitAsync();
        loggerFactory.CreateLogger(AuditLogCategory).LogInformation(
            "User {ActorId} set ban state of {TargetId} to {IsBanned}",
            EndpointHelpers.GetUserId(principal), target.Id, target.IsBanned);
        return Results.NoContent();
    }

    private static async Task<IResult> Delete(
        Guid userId,
        ClaimsPrincipal principal,
        UserManager<ApplicationUser> userManager,
        SongBookDbContext dbContext,
        ILoggerFactory loggerFactory)
    {
        (ApplicationUser? target, IResult? denial) = await GetManageableUserAsync(
            userId, principal, userManager);
        if (denial is not null)
        {
            return denial;
        }

        await using var transaction = await dbContext.Database.BeginTransactionAsync();
        await dbContext.SongBooks
            .Where(book => book.OwnerId == target!.Id)
            .ExecuteDeleteAsync();
        EnsureSucceeded(await userManager.DeleteAsync(target!));
        await transaction.CommitAsync();
        loggerFactory.CreateLogger(AuditLogCategory).LogInformation(
            "User {ActorId} deleted account {TargetId}",
            EndpointHelpers.GetUserId(principal), target!.Id);
        return Results.NoContent();
    }

    private static async Task<(ApplicationUser? Target, IResult? Denial)> GetManageableUserAsync(
        Guid userId,
        ClaimsPrincipal principal,
        UserManager<ApplicationUser> userManager)
    {
        if (userId.ToString() == EndpointHelpers.GetUserId(principal))
        {
            return (null, Results.Forbid());
        }

        ApplicationUser? target = await userManager.FindByIdAsync(userId.ToString());
        if (target is null)
        {
            return (null, Results.NotFound());
        }

        if (await userManager.IsInRoleAsync(target, AuthConstants.SuperUserRole) ||
            (!principal.IsInRole(AuthConstants.SuperUserRole) &&
             await userManager.IsInRoleAsync(target, AuthConstants.ModeratorRole)))
        {
            return (null, Results.Forbid());
        }

        return (target, null);
    }

    private static IResult ValidationProblem(string key, string error) =>
        Results.ValidationProblem(new Dictionary<string, string[]> { [key] = [error] });

    private static void EnsureSucceeded(IdentityResult result)
    {
        if (!result.Succeeded)
        {
            throw new InvalidOperationException(
                "User management failed: " +
                string.Join(", ", result.Errors.Select(error => error.Code)));
        }
    }
}
