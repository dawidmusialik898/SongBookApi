using System.Net;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SongBookApi.Infrastructure.Identity;
using SongBookApi.Service.Contracts;

namespace SongBookApi.Service.Tests;

[Trait("Category", "Integration")]
public sealed class SongBookAccessTests : IClassFixture<TestApplicationFactory>
{
    private readonly TestApplicationFactory _factory;

    public SongBookAccessTests(TestApplicationFactory factory) => _factory = factory;

    [Fact]
    public async Task AdminCanGrantChangeAndRemoveAccessWithImmediateRevocation()
    {
        string readerEmail = $"reader-{Guid.NewGuid():N}@example.test";
        using HttpClient owner = await CreateUserAsync("owner");
        using HttpClient reader = await AuthenticationTestHelpers.CreateConfirmedClientAsync(_factory, readerEmail);
        SongBookResponse book = await SongBookTestHelpers.CreateBookAsync(owner, "Shared");

        SongBookAccessResponse granted =
            await SongBookTestHelpers.SetAccessAsync(owner, book.Id, readerEmail, "reader");
        Assert.Equal(readerEmail, granted.Email);
        Assert.Equal("reader", granted.AccessLevel);
        Assert.DoesNotContain("userId", await JsonContentAsync(granted));

        SongBookAccessResponse reapplied =
            await SongBookTestHelpers.SetAccessAsync(owner, book.Id, readerEmail, "reader");
        Assert.Equal(granted.Id, reapplied.Id);

        SongBookAccessResponse changed =
            await SongBookTestHelpers.SetAccessAsync(owner, book.Id, readerEmail, "editor");
        Assert.Equal(granted.Id, changed.Id);
        Assert.Equal("editor", changed.AccessLevel);
        Assert.Contains(
            (await reader.GetFromJsonAsync<SongBookResponse[]>("/songbooks"))!,
            candidate => candidate.Id == book.Id && candidate.AccessLevel == "editor");

        using HttpResponseMessage removed =
            await AuthenticationTestHelpers.DeleteWithAntiforgeryAsync(
                owner, $"/songbooks/{book.Id}/access/{granted.Id}");
        Assert.Equal(HttpStatusCode.NoContent, removed.StatusCode);
        Assert.DoesNotContain(
            (await reader.GetFromJsonAsync<SongBookResponse[]>("/songbooks"))!,
            candidate => candidate.Id == book.Id);
        Assert.Equal(HttpStatusCode.NotFound, (await reader.GetAsync($"/songbooks/{book.Id}")).StatusCode);
    }

    [Fact]
    public async Task UnknownInvalidAndOwnerCollaboratorsAreRejectedAndOwnerHasNoAccessRow()
    {
        string ownerEmail = $"owner-protection-{Guid.NewGuid():N}@example.test";
        using HttpClient owner =
            await AuthenticationTestHelpers.CreateConfirmedClientAsync(_factory, ownerEmail);
        SongBookResponse book = await SongBookTestHelpers.CreateBookAsync(owner, "Owner protection");

        using HttpResponseMessage unknown =
            await AuthenticationTestHelpers.PutJsonWithAntiforgeryAsync(
                owner,
                $"/songbooks/{book.Id}/access",
                new { email = $"missing-{Guid.NewGuid():N}@example.test", accessLevel = "reader" });
        using HttpResponseMessage ownerAttempt =
            await AuthenticationTestHelpers.PutJsonWithAntiforgeryAsync(
                owner,
                $"/songbooks/{book.Id}/access",
                new { email = ownerEmail, accessLevel = "reader" });
        using HttpResponseMessage adminAttempt =
            await AuthenticationTestHelpers.PutJsonWithAntiforgeryAsync(
                owner,
                $"/songbooks/{book.Id}/access",
                new { email = ownerEmail, accessLevel = "admin" });
        using HttpResponseMessage wrongRemoval =
            await AuthenticationTestHelpers.DeleteWithAntiforgeryAsync(
                owner, $"/songbooks/{book.Id}/access/{Guid.NewGuid()}");

        Assert.Equal(HttpStatusCode.NotFound, unknown.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, ownerAttempt.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, adminAttempt.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, wrongRemoval.StatusCode);

        using IServiceScope scope = _factory.Services.CreateScope();
        SongBookDbContext db = scope.ServiceProvider.GetRequiredService<SongBookDbContext>();
        Assert.False(await db.SongBookAccessEntries.AnyAsync(entry => entry.SongBookId == book.Id));
    }

    private static Task<string> JsonContentAsync(SongBookAccessResponse response) =>
        Task.FromResult(System.Text.Json.JsonSerializer.Serialize(
            response,
            new System.Text.Json.JsonSerializerOptions(System.Text.Json.JsonSerializerDefaults.Web)));

    private Task<HttpClient> CreateUserAsync(string prefix) =>
        AuthenticationTestHelpers.CreateConfirmedClientAsync(
            _factory,
            $"{prefix}-{Guid.NewGuid():N}@example.test");
}
