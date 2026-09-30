using System.Net;
using System.Net.Http.Json;
using SongBookApi.Service.Contracts;

namespace SongBookApi.Service.Tests.Functional;

[Trait("Category", "Functional")]
public sealed class SongCrudFunctionalTests : IClassFixture<SongBookApiFactory>
{
    private readonly SongBookApiFactory _factory;

    public SongCrudFunctionalTests(SongBookApiFactory factory) => _factory = factory;

    [Fact]
    public async Task NestedCrudRoundTripsStablePartIdsAndOrder()
    {
        using HttpClient client = await AuthenticationTestHelpers.CreateConfirmedClientAsync(
            _factory,
            $"functional-{Guid.NewGuid():N}@example.test");
        SongBookResponse book = await CreateBookAsync(client);
        SongResponse song = await CreateSongAsync(client, book.Id);
        Guid verseId = song.Parts[0].Id;
        Guid chorusId = song.Parts[1].Id;

        using HttpResponseMessage update = await AuthenticationTestHelpers.PutJsonWithAntiforgeryAsync(
            client,
            $"/songbooks/{book.Id}/songs/{song.Id}",
            new
            {
                title = "Updated",
                parts = new object[]
                {
                    new { id = chorusId, name = "Chorus", text = "Updated chorus" },
                    new { id = verseId, name = "Verse", text = "Updated verse" },
                    new { name = "Bridge", text = "New" }
                }
            });
        Assert.Equal(HttpStatusCode.NoContent, update.StatusCode);

        SongResponse? changed = await client.GetFromJsonAsync<SongResponse>(
            $"/songbooks/{book.Id}/songs/{song.Id}");
        Assert.NotNull(changed);
        Assert.Equal(new[] { chorusId, verseId }, changed.Parts.Take(2).Select(part => part.Id));
        Assert.Equal(new[] { "Chorus", "Verse", "Bridge" }, changed.Parts.Select(part => part.Name));
        Assert.NotEqual(Guid.Empty, changed.Parts[2].Id);

        SongResponse[]? listed = await client.GetFromJsonAsync<SongResponse[]>(
            $"/songbooks/{book.Id}/songs");
        Assert.Contains(listed!, candidate => candidate.Id == song.Id);

        using HttpResponseMessage delete = await AuthenticationTestHelpers.DeleteWithAntiforgeryAsync(
            client, $"/songbooks/{book.Id}/songs/{song.Id}");
        Assert.Equal(HttpStatusCode.NoContent, delete.StatusCode);
        Assert.Equal(
            HttpStatusCode.NotFound,
            (await client.GetAsync($"/songbooks/{book.Id}/songs/{song.Id}")).StatusCode);
    }

    private static async Task<SongBookResponse> CreateBookAsync(HttpClient client)
    {
        using HttpResponseMessage response =
            await AuthenticationTestHelpers.PostJsonWithAntiforgeryAsync(
                client, "/songbooks", new { name = "Functional" });
        return Assert.IsType<SongBookResponse>(
            await response.Content.ReadFromJsonAsync<SongBookResponse>());
    }

    private static async Task<SongResponse> CreateSongAsync(HttpClient client, Guid bookId)
    {
        using HttpResponseMessage response =
            await AuthenticationTestHelpers.PostJsonWithAntiforgeryAsync(
                client,
                $"/songbooks/{bookId}/songs",
                new
                {
                    title = "Original",
                    parts = new[]
                    {
                        new { name = "Verse", text = "Verse text" },
                        new { name = "Chorus", text = "Chorus text" }
                    }
                });
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return Assert.IsType<SongResponse>(
            await response.Content.ReadFromJsonAsync<SongResponse>());
    }
}
