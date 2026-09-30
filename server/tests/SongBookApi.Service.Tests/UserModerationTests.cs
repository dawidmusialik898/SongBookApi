using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SongBookApi.Infrastructure.Identity;
using SongBookApi.Service.Contracts;

namespace SongBookApi.Service.Tests;

[Trait("Category", "Integration")]
public sealed class UserModerationTests
{
    [Fact]
    public async Task OnlyConfiguredConfirmedEmailBecomesInitialSuperUser()
    {
        string superEmail = UniqueEmail("super");
        using TestApplicationFactory factory = new(false, superEmail);
        using HttpClient ordinary = await AuthenticationTestHelpers.CreateConfirmedClientAsync(
            factory, UniqueEmail("ordinary"));
        using HttpClient waiting = factory.CreateSecureClient();

        using HttpResponseMessage registration = await AuthenticationTestHelpers.PostJsonWithAntiforgeryAsync(
            waiting, "/auth/register", new
            {
                email = superEmail,
                password = AuthenticationTestHelpers.Password
            });
        Assert.Equal(HttpStatusCode.Accepted, registration.StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await ordinary.GetAsync("/admin/users")).StatusCode);

        using IServiceScope scope = factory.Services.CreateScope();
        UserManager<ApplicationUser> manager = scope.ServiceProvider
            .GetRequiredService<UserManager<ApplicationUser>>();
        ApplicationUser unconfirmed = (await manager.FindByEmailAsync(superEmail))!;
        Assert.False(unconfirmed.EmailConfirmed);
        Assert.False(await manager.IsInRoleAsync(unconfirmed, "SuperUser"));

        Uri confirmation = new(factory.EmailSender.ConfirmationLinkFor(superEmail));
        using HttpResponseMessage confirmed = await waiting.GetAsync(confirmation.PathAndQuery);
        Assert.Equal(HttpStatusCode.Found, confirmed.StatusCode);
        using HttpResponseMessage login = await LoginAsync(waiting, superEmail);
        Assert.Equal(HttpStatusCode.NoContent, login.StatusCode);
        Assert.Equal("superuser",
            (await waiting.GetFromJsonAsync<AuthenticatedUserResponse>("/auth/me"))?.Role);

        ModeratedUserResponse[] users =
            (await waiting.GetFromJsonAsync<ModeratedUserResponse[]>("/admin/users"))!;
        Assert.Single(users);
        Assert.Equal("user", users[0].Role);
        Assert.DoesNotContain(users, user => user.Email == superEmail);
    }

    [Fact]
    public async Task ConfiguringBootstrapEmailPromotesAnExistingConfirmedAccountOnRestart()
    {
        DirectoryInfo directory = Directory.CreateTempSubdirectory("songbook-moderation-");
        string databasePath = Path.Combine(directory.FullName, "songbook.db");
        string superEmail = UniqueEmail("existing");
        try
        {
            using (TestApplicationFactory before = new(databasePath))
            {
                using HttpClient user = await AuthenticationTestHelpers.CreateConfirmedClientAsync(
                    before, superEmail);
                Assert.Equal("user",
                    (await user.GetFromJsonAsync<AuthenticatedUserResponse>("/auth/me"))?.Role);
            }

            using TestApplicationFactory after = new(databasePath, superEmail);
            using HttpClient admin = after.CreateSecureClient();
            using HttpResponseMessage login = await LoginAsync(admin, superEmail);
            Assert.Equal(HttpStatusCode.NoContent, login.StatusCode);
            Assert.Equal("superuser",
                (await admin.GetFromJsonAsync<AuthenticatedUserResponse>("/auth/me"))?.Role);
        }
        finally
        {
            directory.Delete(recursive: true);
        }
    }

    [Fact]
    public async Task OnlySuperUserCanAssignModerators_AndModeratorsCannotManagePeers()
    {
        string superEmail = UniqueEmail("super");
        using TestApplicationFactory factory = new(false, superEmail);
        using HttpClient super = await AuthenticationTestHelpers.CreateConfirmedClientAsync(factory, superEmail);
        string moderatorEmail = UniqueEmail("moderator");
        using HttpClient moderator = await AuthenticationTestHelpers.CreateConfirmedClientAsync(
            factory, moderatorEmail);
        string anotherEmail = UniqueEmail("another");
        using HttpClient another = await AuthenticationTestHelpers.CreateConfirmedClientAsync(
            factory, anotherEmail);
        string ordinaryEmail = UniqueEmail("ordinary");
        using HttpClient ordinary = await AuthenticationTestHelpers.CreateConfirmedClientAsync(
            factory, ordinaryEmail);

        string superId = await GetUserIdAsync(factory, superEmail);
        string moderatorId = await GetUserIdAsync(factory, moderatorEmail);
        string anotherId = await GetUserIdAsync(factory, anotherEmail);
        string ordinaryId = await GetUserIdAsync(factory, ordinaryEmail);

        Assert.Equal(HttpStatusCode.Forbidden,
            (await AuthenticationTestHelpers.PutJsonWithAntiforgeryAsync(
                ordinary, $"/admin/users/{anotherId}/ban", new { isBanned = true })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,
            (await AuthenticationTestHelpers.DeleteWithAntiforgeryAsync(
                ordinary, $"/admin/users/{anotherId}")).StatusCode);
        using (HttpClient guest = factory.CreateSecureClient())
        {
            Assert.Equal(HttpStatusCode.Unauthorized, (await guest.GetAsync("/admin/users")).StatusCode);
        }
        Assert.Equal(HttpStatusCode.Forbidden, (await ordinary.GetAsync("/admin/users")).StatusCode);
        using (HttpResponseMessage noToken = await super.PutAsJsonAsync(
                   $"/admin/users/{moderatorId}/role", new { role = "moderator" }))
        {
            Assert.Equal(HttpStatusCode.BadRequest, noToken.StatusCode);
        }
        using (HttpResponseMessage noBanToken = await super.PutAsJsonAsync(
                   $"/admin/users/{ordinaryId}/ban", new { isBanned = true }))
        {
            Assert.Equal(HttpStatusCode.BadRequest, noBanToken.StatusCode);
        }
        using (HttpResponseMessage noDeleteToken = await super.DeleteAsync(
                   $"/admin/users/{ordinaryId}"))
        {
            Assert.Equal(HttpStatusCode.BadRequest, noDeleteToken.StatusCode);
        }
        using (HttpResponseMessage assigned = await AuthenticationTestHelpers.PutJsonWithAntiforgeryAsync(
                   super, $"/admin/users/{moderatorId}/role", new { role = "moderator" }))
        {
            Assert.Equal(HttpStatusCode.NoContent, assigned.StatusCode);
        }

        Assert.False((await moderator.GetFromJsonAsync<AuthenticatedUserResponse>("/auth/me"))?.IsAuthenticated);
        using (HttpResponseMessage login = await LoginAsync(moderator, moderatorEmail))
        {
            Assert.Equal(HttpStatusCode.NoContent, login.StatusCode);
        }
        Assert.Equal("moderator",
            (await moderator.GetFromJsonAsync<AuthenticatedUserResponse>("/auth/me"))?.Role);
        SongBookResponse privateBook = await SongBookTestHelpers.CreateBookAsync(
            another, "Other user's private book");
        Assert.Equal(HttpStatusCode.NotFound,
            (await super.GetAsync($"/songbooks/{privateBook.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,
            (await moderator.GetAsync($"/songbooks/{privateBook.Id}")).StatusCode);
        ModeratedUserResponse[] users =
            (await moderator.GetFromJsonAsync<ModeratedUserResponse[]>("/admin/users"))!;
        Assert.Equal(3, users.Length);
        Assert.Contains(users, user => user.Id == superId && user.Role == "superuser");
        Assert.Contains(users, user => user.Id == ordinaryId && user.Role == "user");

        Assert.Equal(HttpStatusCode.Forbidden,
            (await AuthenticationTestHelpers.PutJsonWithAntiforgeryAsync(
                moderator, $"/admin/users/{anotherId}/role", new { role = "moderator" })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,
            (await AuthenticationTestHelpers.PutJsonWithAntiforgeryAsync(
                moderator, $"/admin/users/{superId}/ban", new { isBanned = true })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,
            (await AuthenticationTestHelpers.DeleteWithAntiforgeryAsync(
                moderator, $"/admin/users/{superId}")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,
            (await AuthenticationTestHelpers.PutJsonWithAntiforgeryAsync(
                moderator, $"/admin/users/{moderatorId}/ban", new { isBanned = true })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,
            (await AuthenticationTestHelpers.PutJsonWithAntiforgeryAsync(
                super, $"/admin/users/{superId}/role", new { role = "user" })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,
            (await AuthenticationTestHelpers.DeleteWithAntiforgeryAsync(
                super, $"/admin/users/{superId}")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,
            (await AuthenticationTestHelpers.PutJsonWithAntiforgeryAsync(
                super, $"/admin/users/{superId}/ban", new { isBanned = true })).StatusCode);

        Assert.Equal(HttpStatusCode.NoContent,
            (await AuthenticationTestHelpers.PutJsonWithAntiforgeryAsync(
                moderator, $"/admin/users/{ordinaryId}/ban", new { isBanned = true })).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await ordinary.GetAsync("/songbooks")).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent,
            (await AuthenticationTestHelpers.PutJsonWithAntiforgeryAsync(
                moderator, $"/admin/users/{ordinaryId}/ban", new { isBanned = false })).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent,
            (await AuthenticationTestHelpers.DeleteWithAntiforgeryAsync(
                moderator, $"/admin/users/{ordinaryId}")).StatusCode);
        Assert.False((await ordinary.GetFromJsonAsync<AuthenticatedUserResponse>("/auth/me"))?.IsAuthenticated);

        using (HttpResponseMessage assignedOther = await AuthenticationTestHelpers.PutJsonWithAntiforgeryAsync(
                   super, $"/admin/users/{anotherId}/role", new { role = "moderator" }))
        {
            Assert.Equal(HttpStatusCode.NoContent, assignedOther.StatusCode);
        }
        Assert.Equal(HttpStatusCode.Forbidden,
            (await AuthenticationTestHelpers.DeleteWithAntiforgeryAsync(
                moderator, $"/admin/users/{anotherId}")).StatusCode);
        using (HttpResponseMessage demoted = await AuthenticationTestHelpers.PutJsonWithAntiforgeryAsync(
                   super, $"/admin/users/{moderatorId}/role", new { role = "user" }))
        {
            Assert.Equal(HttpStatusCode.NoContent, demoted.StatusCode);
        }
        Assert.Equal(HttpStatusCode.Unauthorized, (await moderator.GetAsync("/admin/users")).StatusCode);
        using (HttpResponseMessage login = await LoginAsync(moderator, moderatorEmail))
        {
            Assert.Equal(HttpStatusCode.NoContent, login.StatusCode);
        }
        Assert.Equal(HttpStatusCode.Forbidden, (await moderator.GetAsync("/admin/users")).StatusCode);
    }

    [Fact]
    public async Task BanningRevokesSessionsAndLogin_UnbanningAllowsFreshLogin()
    {
        string superEmail = UniqueEmail("super");
        using TestApplicationFactory factory = new(false, superEmail);
        using HttpClient super = await AuthenticationTestHelpers.CreateConfirmedClientAsync(factory, superEmail);
        string targetEmail = UniqueEmail("target");
        using HttpClient target = await AuthenticationTestHelpers.CreateConfirmedClientAsync(
            factory, targetEmail);
        string targetId = await GetUserIdAsync(factory, targetEmail);

        Assert.Equal(HttpStatusCode.BadRequest,
            (await AuthenticationTestHelpers.PutJsonWithAntiforgeryAsync(
                super, $"/admin/users/{targetId}/ban", new { })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,
            (await AuthenticationTestHelpers.PutJsonWithAntiforgeryAsync(
                super, $"/admin/users/{targetId}/role", new { role = "superuser" })).StatusCode);

        using (HttpResponseMessage banned = await AuthenticationTestHelpers.PutJsonWithAntiforgeryAsync(
                   super, $"/admin/users/{targetId}/ban", new { isBanned = true }))
        {
            Assert.Equal(HttpStatusCode.NoContent, banned.StatusCode);
        }

        Assert.Equal(HttpStatusCode.Unauthorized, (await target.GetAsync("/songbooks")).StatusCode);
        Assert.False((await target.GetFromJsonAsync<AuthenticatedUserResponse>("/auth/me"))?.IsAuthenticated);
        using (HttpResponseMessage deniedLogin = await LoginAsync(target, targetEmail))
        {
            Assert.Equal(HttpStatusCode.Unauthorized, deniedLogin.StatusCode);
        }
        Assert.Contains(
            (await super.GetFromJsonAsync<ModeratedUserResponse[]>("/admin/users"))!,
            user => user.Id == targetId && user.IsBanned);
        using (HttpResponseMessage unbanned = await AuthenticationTestHelpers.PutJsonWithAntiforgeryAsync(
                   super, $"/admin/users/{targetId}/ban", new { isBanned = false }))
        {
            Assert.Equal(HttpStatusCode.NoContent, unbanned.StatusCode);
        }
        using (HttpResponseMessage login = await LoginAsync(target, targetEmail))
        {
            Assert.Equal(HttpStatusCode.NoContent, login.StatusCode);
        }
        Assert.Equal(HttpStatusCode.OK, (await target.GetAsync("/songbooks")).StatusCode);
    }

    [Fact]
    public async Task UnconfirmedAndBannedAccountsCannotBecomeModerators()
    {
        string superEmail = UniqueEmail("super");
        using TestApplicationFactory factory = new(false, superEmail);
        using HttpClient super = await AuthenticationTestHelpers.CreateConfirmedClientAsync(factory, superEmail);
        string targetEmail = UniqueEmail("unconfirmed");
        using HttpClient registering = factory.CreateSecureClient();
        using HttpResponseMessage registration = await AuthenticationTestHelpers.PostJsonWithAntiforgeryAsync(
            registering, "/auth/register", new
            {
                email = targetEmail,
                password = AuthenticationTestHelpers.Password
            });
        Assert.Equal(HttpStatusCode.Accepted, registration.StatusCode);
        string targetId = await GetUserIdAsync(factory, targetEmail);

        Assert.Equal(HttpStatusCode.BadRequest,
            (await AuthenticationTestHelpers.PutJsonWithAntiforgeryAsync(
                super, $"/admin/users/{targetId}/role", new { role = "moderator" })).StatusCode);

        Uri confirmation = new(factory.EmailSender.ConfirmationLinkFor(targetEmail));
        using HttpResponseMessage confirmed = await registering.GetAsync(confirmation.PathAndQuery);
        Assert.Equal(HttpStatusCode.Found, confirmed.StatusCode);
        Assert.Equal(HttpStatusCode.NoContent,
            (await AuthenticationTestHelpers.PutJsonWithAntiforgeryAsync(
                super, $"/admin/users/{targetId}/ban", new { isBanned = true })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,
            (await AuthenticationTestHelpers.PutJsonWithAntiforgeryAsync(
                super, $"/admin/users/{targetId}/role", new { role = "moderator" })).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent,
            (await AuthenticationTestHelpers.PutJsonWithAntiforgeryAsync(
                super, $"/admin/users/{targetId}/ban", new { isBanned = false })).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent,
            (await AuthenticationTestHelpers.PutJsonWithAntiforgeryAsync(
                super, $"/admin/users/{targetId}/role", new { role = "moderator" })).StatusCode);
    }

    [Fact]
    public async Task DeletingAccountRemovesOwnedContentAndCollaboratorAccess()
    {
        string superEmail = UniqueEmail("super");
        using TestApplicationFactory factory = new(false, superEmail);
        using HttpClient super = await AuthenticationTestHelpers.CreateConfirmedClientAsync(factory, superEmail);
        string targetEmail = UniqueEmail("target");
        using HttpClient target = await AuthenticationTestHelpers.CreateConfirmedClientAsync(factory, targetEmail);
        string otherEmail = UniqueEmail("other");
        using HttpClient other = await AuthenticationTestHelpers.CreateConfirmedClientAsync(factory, otherEmail);
        string targetId = await GetUserIdAsync(factory, targetEmail);
        SongBookResponse removedBook = await SongBookTestHelpers.CreateBookAsync(target, "To remove");
        SongResponse removedSong = await SongBookTestHelpers.CreateSongAsync(target, removedBook.Id,
            parts: [new { name = "Verse", text = "Lyrics" }]);
        _ = await SongBookTestHelpers.SetAccessAsync(target, removedBook.Id, otherEmail, "reader");
        SongBookResponse retainedBook = await SongBookTestHelpers.CreateBookAsync(other, "To retain");
        _ = await SongBookTestHelpers.SetAccessAsync(other, retainedBook.Id, targetEmail, "reader");

        using HttpResponseMessage deletion = await AuthenticationTestHelpers.DeleteWithAntiforgeryAsync(
            super, $"/admin/users/{targetId}");
        Assert.Equal(HttpStatusCode.NoContent, deletion.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await other.GetAsync(
            $"/songbooks/{removedBook.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await other.GetAsync(
            $"/songbooks/{retainedBook.Id}")).StatusCode);
        Assert.False((await target.GetFromJsonAsync<AuthenticatedUserResponse>("/auth/me"))?.IsAuthenticated);
        using (HttpResponseMessage deniedLogin = await LoginAsync(target, targetEmail))
        {
            Assert.Equal(HttpStatusCode.Unauthorized, deniedLogin.StatusCode);
        }

        using IServiceScope scope = factory.Services.CreateScope();
        SongBookDbContext db = scope.ServiceProvider.GetRequiredService<SongBookDbContext>();
        Assert.False(await db.Users.AnyAsync(user => user.Id == targetId));
        Assert.False(await db.SongBooks.AnyAsync(book => book.Id == removedBook.Id));
        Assert.False(await db.Songs.AnyAsync(song => song.Id == removedSong.Id));
        Assert.False(await db.Parts.AnyAsync(part => part.SongId == removedSong.Id));
        Assert.False(await db.SongBookAccessEntries.AnyAsync(access => access.UserId == targetId));
    }

    private static string UniqueEmail(string prefix) =>
        $"{prefix}-{Guid.NewGuid():N}@example.test";

    private static async Task<string> GetUserIdAsync(TestApplicationFactory factory, string email)
    {
        using IServiceScope scope = factory.Services.CreateScope();
        ApplicationUser user = (await scope.ServiceProvider
            .GetRequiredService<UserManager<ApplicationUser>>()
            .FindByEmailAsync(email))!;
        return user.Id;
    }

    private static Task<HttpResponseMessage> LoginAsync(HttpClient client, string email) =>
        AuthenticationTestHelpers.PostJsonWithAntiforgeryAsync(
            client, "/auth/login", new
            {
                email,
                password = AuthenticationTestHelpers.Password,
                rememberMe = false
            });
}
