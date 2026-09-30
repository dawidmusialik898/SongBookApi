using System.Net;
using System.Net.Http.Json;
using SongBookApi.Service.Contracts;

namespace SongBookApi.Service.Tests;

[Trait("Category", "Integration")]
public sealed class AuthenticationTests : IClassFixture<TestApplicationFactory>
{
    private readonly TestApplicationFactory _factory;

    public AuthenticationTests(TestApplicationFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task RegistrationConfirmationLoginAndSession_WorkWithSecureCookies()
    {
        string email = $"auth-{Guid.NewGuid():N}@example.test";
        using HttpClient client = _factory.CreateSecureClient();

        using HttpResponseMessage registration = await AuthenticationTestHelpers.PostJsonWithAntiforgeryAsync(
            client, "/auth/register", new { email, password = AuthenticationTestHelpers.Password });
        Assert.Equal(HttpStatusCode.Accepted, registration.StatusCode);
        AuthenticatedUserResponse registrationSession = Assert.IsType<AuthenticatedUserResponse>(
            await client.GetFromJsonAsync<AuthenticatedUserResponse>("/auth/me"));
        Assert.False(registrationSession.IsAuthenticated);

        using (HttpResponseMessage unconfirmedLogin = await AuthenticationTestHelpers.PostJsonWithAntiforgeryAsync(
                   client, "/auth/login", new
                   {
                       email,
                       password = AuthenticationTestHelpers.Password,
                       rememberMe = false
                   }))
        {
            Assert.Equal(HttpStatusCode.Unauthorized, unconfirmedLogin.StatusCode);
        }

        Uri confirmation = new(_factory.EmailSender.ConfirmationLinkFor(email));
        using (HttpResponseMessage confirmationResponse = await client.GetAsync(confirmation.PathAndQuery))
        {
            Assert.Equal(HttpStatusCode.Found, confirmationResponse.StatusCode);
            Assert.Equal("/?auth=confirmed", confirmationResponse.Headers.Location?.OriginalString);
        }

        using (HttpResponseMessage login = await AuthenticationTestHelpers.PostJsonWithAntiforgeryAsync(
                   client, "/auth/login", new
                   {
                       email,
                       password = AuthenticationTestHelpers.Password,
                       rememberMe = false
                   }))
        {
            Assert.Equal(HttpStatusCode.NoContent, login.StatusCode);
            string authenticationCookie = Assert.Single(
                login.Headers.GetValues("Set-Cookie"),
                value => value.StartsWith("__Host-SongBook.Auth=", StringComparison.Ordinal));
            Assert.Contains("path=/", authenticationCookie, StringComparison.OrdinalIgnoreCase);
            Assert.Contains("secure", authenticationCookie, StringComparison.OrdinalIgnoreCase);
            Assert.Contains("httponly", authenticationCookie, StringComparison.OrdinalIgnoreCase);
            Assert.Contains("samesite=lax", authenticationCookie, StringComparison.OrdinalIgnoreCase);
        }

        AuthenticatedUserResponse session = Assert.IsType<AuthenticatedUserResponse>(
            await client.GetFromJsonAsync<AuthenticatedUserResponse>("/auth/me"));
        Assert.True(session.IsAuthenticated);
        Assert.Equal(email, session.Email);
    }

    [Fact]
    public async Task LoginAndForgotPassword_DoNotRevealAccountExistence()
    {
        using HttpClient client = _factory.CreateSecureClient();
        string unknown = $"unknown-{Guid.NewGuid():N}@example.test";

        using HttpResponseMessage unknownLogin = await AuthenticationTestHelpers.PostJsonWithAntiforgeryAsync(
            client, "/auth/login", new
            {
                email = unknown,
                password = AuthenticationTestHelpers.Password,
                rememberMe = false
            });
        Assert.Equal(HttpStatusCode.Unauthorized, unknownLogin.StatusCode);

        string known = $"known-{Guid.NewGuid():N}@example.test";
        using HttpClient knownClient = await AuthenticationTestHelpers.CreateConfirmedClientAsync(_factory, known);
        using HttpResponseMessage knownForgot = await AuthenticationTestHelpers.PostJsonWithAntiforgeryAsync(
            client, "/auth/forgot-password", new { email = known });
        using HttpResponseMessage unknownForgot = await AuthenticationTestHelpers.PostJsonWithAntiforgeryAsync(
            client, "/auth/forgot-password", new { email = unknown });

        Assert.Equal(HttpStatusCode.Accepted, knownForgot.StatusCode);
        Assert.Equal(HttpStatusCode.Accepted, unknownForgot.StatusCode);
        Assert.Equal(
            await knownForgot.Content.ReadAsStringAsync(),
            await unknownForgot.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task PasswordResetAndLogout_InvalidatePriorSession()
    {
        string email = $"reset-{Guid.NewGuid():N}@example.test";
        using HttpClient client = await AuthenticationTestHelpers.CreateConfirmedClientAsync(_factory, email);

        using (HttpResponseMessage forgot = await AuthenticationTestHelpers.PostJsonWithAntiforgeryAsync(
                   client, "/auth/forgot-password", new { email }))
        {
            Assert.Equal(HttpStatusCode.Accepted, forgot.StatusCode);
        }

        Uri reset = new(_factory.EmailSender.PasswordResetLinkFor(email));
        Dictionary<string, string> query = reset.Query.TrimStart('?')
            .Split('&', StringSplitOptions.RemoveEmptyEntries)
            .Select(part => part.Split('=', 2))
            .ToDictionary(
                pair => Uri.UnescapeDataString(pair[0]),
                pair => Uri.UnescapeDataString(pair.Length > 1 ? pair[1] : string.Empty));
        const string newPassword = "another password with enough length";
        using (HttpResponseMessage resetResponse = await AuthenticationTestHelpers.PostJsonWithAntiforgeryAsync(
                   client, "/auth/reset-password", new
                   {
                       email,
                       code = query["code"],
                       newPassword
                   }))
        {
            Assert.Equal(HttpStatusCode.NoContent, resetResponse.StatusCode);
        }
        using (HttpResponseMessage reusedReset = await AuthenticationTestHelpers.PostJsonWithAntiforgeryAsync(
                   client, "/auth/reset-password", new
                   {
                       email,
                       code = query["code"],
                       newPassword = "third password with enough length"
                   }))
        {
            Assert.Equal(HttpStatusCode.BadRequest, reusedReset.StatusCode);
        }

        using (HttpResponseMessage logout = await AuthenticationTestHelpers.PostJsonWithAntiforgeryAsync(
                   client, "/auth/logout", new { }))
        {
            Assert.Equal(HttpStatusCode.NoContent, logout.StatusCode);
        }

        using HttpResponseMessage oldPasswordLogin = await AuthenticationTestHelpers.PostJsonWithAntiforgeryAsync(
            client, "/auth/login", new
            {
                email,
                password = AuthenticationTestHelpers.Password,
                rememberMe = false
            });
        Assert.Equal(HttpStatusCode.Unauthorized, oldPasswordLogin.StatusCode);

        using HttpResponseMessage newPasswordLogin = await AuthenticationTestHelpers.PostJsonWithAntiforgeryAsync(
            client, "/auth/login", new { email, password = newPassword, rememberMe = false });
        Assert.Equal(HttpStatusCode.NoContent, newPasswordLogin.StatusCode);
    }

    [Fact]
    public async Task RegistrationValidation_ReturnsStructuredErrors()
    {
        using HttpClient client = _factory.CreateSecureClient();
        using HttpResponseMessage response = await AuthenticationTestHelpers.PostJsonWithAntiforgeryAsync(
            client, "/auth/register", new { email = "not-an-email", password = "" });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
    }

    [Fact]
    public async Task DevelopmentStaticClientFiles_AreServedFromApiOrigin()
    {
        using HttpClient client = _factory.CreateSecureClient();

        using HttpResponseMessage index = await client.GetAsync("/");
        using HttpResponseMessage module = await client.GetAsync("/src/main.js");
        using HttpResponseMessage style = await client.GetAsync("/styles/app.css");

        Assert.Equal(HttpStatusCode.OK, index.StatusCode);
        Assert.Equal(HttpStatusCode.OK, module.StatusCode);
        Assert.Equal(HttpStatusCode.OK, style.StatusCode);
    }

    [Fact]
    public async Task LoginAndEmailEndpoints_EnforceConfiguredRateLimits()
    {
        using TestApplicationFactory factory = new(useFixedRemoteIp: true);
        using HttpClient client = factory.CreateSecureClient();
        string unknownEmail = $"limited-{Guid.NewGuid():N}@example.test";

        for (int attempt = 0; attempt < 10; attempt++)
        {
            using HttpResponseMessage response =
                await AuthenticationTestHelpers.PostJsonWithAntiforgeryAsync(
                    client,
                    "/auth/login",
                    new
                    {
                        email = unknownEmail,
                        password = AuthenticationTestHelpers.Password,
                        rememberMe = false
                    });
            Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        }

        using (HttpResponseMessage limitedLogin =
               await AuthenticationTestHelpers.PostJsonWithAntiforgeryAsync(
                   client,
                   "/auth/login",
                   new
                   {
                       email = unknownEmail,
                       password = AuthenticationTestHelpers.Password,
                       rememberMe = false
                   }))
        {
            Assert.Equal(HttpStatusCode.TooManyRequests, limitedLogin.StatusCode);
        }

        for (int request = 0; request < 5; request++)
        {
            using HttpResponseMessage response =
                await AuthenticationTestHelpers.PostJsonWithAntiforgeryAsync(
                    client,
                    "/auth/forgot-password",
                    new { email = unknownEmail });
            Assert.Equal(HttpStatusCode.Accepted, response.StatusCode);
        }

        using HttpResponseMessage limitedEmail =
            await AuthenticationTestHelpers.PostJsonWithAntiforgeryAsync(
                client,
                "/auth/forgot-password",
                new { email = unknownEmail });
        Assert.Equal(HttpStatusCode.TooManyRequests, limitedEmail.StatusCode);
    }
}
