using System.Net;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SongBookApi.Infrastructure.Identity;
using SongBookApi.Service.Contracts;

namespace SongBookApi.Service.Tests;

[Trait("Category", "Integration")]
public sealed class SongBookTests : IClassFixture<TestApplicationFactory>
{
    private readonly TestApplicationFactory _factory;

    public SongBookTests(TestApplicationFactory factory) => _factory = factory;

    [Fact]
    public async Task CreateTrimsNamePersistsAdminAndListsOnlyAccessibleBooks()
    {
        using HttpClient owner = await CreateUserAsync("owner");
        using HttpClient stranger = await CreateUserAsync("stranger");

        SongBookResponse created = await SongBookTestHelpers.CreateBookAsync(owner, "  Sunday Service  ");
        Assert.Equal("Sunday Service", created.Name);
        Assert.Equal("admin", created.AccessLevel);
        Assert.Equal(0, created.SongCount);

        SongBookResponse[]? ownerBooks = await owner.GetFromJsonAsync<SongBookResponse[]>("/songbooks");
        SongBookResponse[]? strangerBooks = await stranger.GetFromJsonAsync<SongBookResponse[]>("/songbooks");
        Assert.Contains(ownerBooks!, book => book.Id == created.Id);
        Assert.Empty(strangerBooks!);
        Assert.Equal(
            HttpStatusCode.NotFound,
            (await stranger.GetAsync($"/songbooks/{created.Id}")).StatusCode);

        using IServiceScope scope = _factory.Services.CreateScope();
        SongBookApi.Domain.Entities.SongBook persisted =
            await scope.ServiceProvider.GetRequiredService<SongBookDbContext>()
                .SongBooks.AsNoTracking().SingleAsync(book => book.Id == created.Id);
        Assert.Equal("SUNDAY SERVICE", persisted.NormalizedName);
        Assert.NotEqual(default, persisted.CreatedAtUtc);
    }

    [Fact]
    public async Task NameValidationAndPerOwnerCaseInsensitiveUniquenessHaveCorrectStatus()
    {
        using HttpClient firstOwner = await CreateUserAsync("first");
        using HttpClient secondOwner = await CreateUserAsync("second");

        foreach (string invalid in new[] { "", "   ", new string('x', 101) })
        {
            using HttpResponseMessage invalidResponse =
                await AuthenticationTestHelpers.PostJsonWithAntiforgeryAsync(
                    firstOwner, "/songbooks", new { name = invalid });
            Assert.Equal(HttpStatusCode.BadRequest, invalidResponse.StatusCode);
            Assert.Equal("application/problem+json", invalidResponse.Content.Headers.ContentType?.MediaType);
        }

        SongBookResponse first = await SongBookTestHelpers.CreateBookAsync(firstOwner, "My Book");
        SongBookResponse second = await SongBookTestHelpers.CreateBookAsync(firstOwner, "Other Book");
        using HttpResponseMessage duplicate =
            await AuthenticationTestHelpers.PostJsonWithAntiforgeryAsync(
                firstOwner, "/songbooks", new { name = "  my book " });
        Assert.Equal(HttpStatusCode.Conflict, duplicate.StatusCode);

        using HttpResponseMessage duplicateRename =
            await AuthenticationTestHelpers.PutJsonWithAntiforgeryAsync(
                firstOwner, $"/songbooks/{second.Id}", new { name = "mY bOoK" });
        Assert.Equal(HttpStatusCode.Conflict, duplicateRename.StatusCode);
        Assert.Equal(
            "My Book",
            (await firstOwner.GetFromJsonAsync<SongBookResponse>($"/songbooks/{first.Id}"))?.Name);
        Assert.Equal(
            "Other Book",
            (await firstOwner.GetFromJsonAsync<SongBookResponse>($"/songbooks/{second.Id}"))?.Name);

        using HttpResponseMessage otherOwner =
            await AuthenticationTestHelpers.PostJsonWithAntiforgeryAsync(
                secondOwner, "/songbooks", new { name = "MY BOOK" });
        Assert.Equal(HttpStatusCode.Created, otherOwner.StatusCode);
    }

    [Fact]
    public async Task GuessedIdsAndOldUnscopedRoutesDoNotExposePrivateSongs()
    {
        using HttpClient owner = await CreateUserAsync("owner-guessed");
        using HttpClient stranger = await CreateUserAsync("stranger-guessed");
        SongBookResponse book = await SongBookTestHelpers.CreateBookAsync(owner, "Private");
        SongResponse song = await SongBookTestHelpers.CreateSongAsync(owner, book.Id);

        Assert.Equal(HttpStatusCode.NotFound, (await stranger.GetAsync($"/songbooks/{book.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await stranger.GetAsync($"/songbooks/{book.Id}/songs")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await stranger.GetAsync($"/songbooks/{book.Id}/songs/{song.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await owner.GetAsync("/songs")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await owner.GetAsync($"/songs/{song.Id}")).StatusCode);
    }

    private Task<HttpClient> CreateUserAsync(string prefix) =>
        AuthenticationTestHelpers.CreateConfirmedClientAsync(
            _factory,
            $"{prefix}-{Guid.NewGuid():N}@example.test");
}
