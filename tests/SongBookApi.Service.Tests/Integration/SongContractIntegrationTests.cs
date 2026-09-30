using System.Net;
using System.Net.Http.Json;
using SongBookApi.Service.Contracts;

namespace SongBookApi.Service.Tests.Integration;

[Trait("Category", "Integration")]
public sealed class SongContractIntegrationTests : IClassFixture<SongBookApiFactory>
{
    private readonly SongBookApiFactory _factory;

    public SongContractIntegrationTests(SongBookApiFactory factory) => _factory = factory;

    [Fact]
    public async Task PutSong_UsesRouteBookAndSongIds()
    {
        using HttpClient client = await AuthenticationTestHelpers.CreateConfirmedClientAsync(
            _factory,
            $"contract-{Guid.NewGuid():N}@example.test");
        SongBookResponse book = await CreateBookAsync(client, "Contract");
        SongResponse song = await CreateSongAsync(client, book.Id, "Before");

        using HttpResponseMessage update = await AuthenticationTestHelpers.PutJsonWithAntiforgeryAsync(
            client,
            $"/songbooks/{book.Id}/songs/{song.Id}",
            new { id = Guid.NewGuid(), title = "After", parts = Array.Empty<object>() });
        Assert.Equal(HttpStatusCode.NoContent, update.StatusCode);

        SongResponse? changed = await client.GetFromJsonAsync<SongResponse>(
            $"/songbooks/{book.Id}/songs/{song.Id}");
        Assert.Equal(song.Id, changed?.Id);
        Assert.Equal("After", changed?.Title);

        SongBookResponse other = await CreateBookAsync(client, "Other");
        Assert.Equal(
            HttpStatusCode.NotFound,
            (await client.GetAsync($"/songbooks/{other.Id}/songs/{song.Id}")).StatusCode);
        Assert.Equal(
            HttpStatusCode.NotFound,
            (await AuthenticationTestHelpers.PutJsonWithAntiforgeryAsync(
                client,
                $"/songbooks/{other.Id}/songs/{song.Id}",
                new { title = "Cross tenant", parts = Array.Empty<object>() })).StatusCode);
    }

    private static async Task<SongBookResponse> CreateBookAsync(HttpClient client, string name)
    {
        using HttpResponseMessage response =
            await AuthenticationTestHelpers.PostJsonWithAntiforgeryAsync(
                client, "/songbooks", new { name });
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return Assert.IsType<SongBookResponse>(
            await response.Content.ReadFromJsonAsync<SongBookResponse>());
    }

    private static async Task<SongResponse> CreateSongAsync(HttpClient client, Guid bookId, string title)
    {
        using HttpResponseMessage response =
            await AuthenticationTestHelpers.PostJsonWithAntiforgeryAsync(
                client,
                $"/songbooks/{bookId}/songs",
                new { title, parts = Array.Empty<object>() });
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return Assert.IsType<SongResponse>(
            await response.Content.ReadFromJsonAsync<SongResponse>());
    }
}
