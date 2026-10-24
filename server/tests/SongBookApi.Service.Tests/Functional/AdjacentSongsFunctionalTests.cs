using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using SongBookApi.Domain;
using SongBookApi.Service.Contracts;

namespace SongBookApi.Service.Tests.Functional;

[Trait("Category", "Functional")]
public sealed class AdjacentSongsFunctionalTests : IClassFixture<SongBookApiFactory>
{
    private readonly SongBookApiFactory _factory;

    public AdjacentSongsFunctionalTests(SongBookApiFactory factory) => _factory = factory;

    [Fact]
    public async Task AdjacentSongsMatchPaginatedListOrderIncludingDuplicateTitles()
    {
        using HttpClient owner = await AuthenticationTestHelpers.CreateConfirmedClientAsync(
            _factory,
            $"adjacent-pages-{Guid.NewGuid():N}@example.test");
        SongBookResponse book = await SongBookTestHelpers.CreateBookAsync(owner, "Adjacent pages");
        for (int index = 0; index < 51; index++)
        {
            string title = index < 2 ? "Duplicate title" : $"Song {index:D3}";
            _ = await SongBookTestHelpers.CreateSongAsync(owner, book.Id, title);
        }

        List<SongSummaryResponse> songs = [];
        PageResult<SongSummaryResponse> page = await GetSongsPageAsync(owner, book.Id, 1);
        songs.AddRange(page.Items);
        Assert.True(page.HasNext);
        page = await GetSongsPageAsync(owner, book.Id, 2);
        songs.AddRange(page.Items);
        Assert.False(page.HasNext);
        Assert.Equal(51, songs.Count);

        foreach (int position in new[] { 0, 1, 25, 49, 50 })
        {
            AdjacentSongsResponse adjacent =
                await GetAdjacentAsync(owner, book.Id, songs[position].Id);

            Assert.Equal(position > 0 ? songs[position - 1] : null, adjacent.Previous);
            Assert.Equal(position + 1 < songs.Count ? songs[position + 1] : null, adjacent.Next);
        }
    }

    [Fact]
    public async Task AdjacentSongsHandlesSingleSongUnknownSongAndSongFromAnotherBook()
    {
        using HttpClient owner = await AuthenticationTestHelpers.CreateConfirmedClientAsync(
            _factory,
            $"adjacent-single-{Guid.NewGuid():N}@example.test");
        SongBookResponse firstBook = await SongBookTestHelpers.CreateBookAsync(owner, "Single song");
        SongBookResponse secondBook = await SongBookTestHelpers.CreateBookAsync(owner, "Other song");
        SongResponse onlySong = await SongBookTestHelpers.CreateSongAsync(
            owner,
            firstBook.Id,
            "Only song");
        SongResponse otherBookSong = await SongBookTestHelpers.CreateSongAsync(
            owner,
            secondBook.Id,
            "Other book song");

        using HttpResponseMessage single = await owner.GetAsync(
            AdjacentPath(firstBook.Id, onlySong.Id));
        Assert.Equal(HttpStatusCode.OK, single.StatusCode);
        using var adjacent = JsonDocument.Parse(
            await single.Content.ReadAsStringAsync());
        Assert.Equal(JsonValueKind.Null,
            adjacent.RootElement.GetProperty("previous").ValueKind);
        Assert.Equal(JsonValueKind.Null,
            adjacent.RootElement.GetProperty("next").ValueKind);

        using HttpResponseMessage unknown = await owner.GetAsync(
            AdjacentPath(firstBook.Id, Guid.NewGuid()));
        Assert.Equal(HttpStatusCode.NotFound, unknown.StatusCode);

        using HttpResponseMessage fromAnotherBook = await owner.GetAsync(
            AdjacentPath(firstBook.Id, otherBookSong.Id));
        Assert.Equal(HttpStatusCode.NotFound, fromAnotherBook.StatusCode);
    }

    [Fact]
    public async Task AdjacentSongsRequireReaderAccessAndAllowReaderCollaborators()
    {
        string readerEmail = $"adjacent-reader-{Guid.NewGuid():N}@example.test";
        using HttpClient owner = await AuthenticationTestHelpers.CreateConfirmedClientAsync(
            _factory,
            $"adjacent-owner-{Guid.NewGuid():N}@example.test");
        using HttpClient reader =
            await AuthenticationTestHelpers.CreateConfirmedClientAsync(_factory, readerEmail);
        SongBookResponse book = await SongBookTestHelpers.CreateBookAsync(owner, "Shared adjacent");
        SongResponse song = await SongBookTestHelpers.CreateSongAsync(
            owner,
            book.Id,
            "Shared song");

        using HttpResponseMessage denied =
            await reader.GetAsync(AdjacentPath(book.Id, song.Id));
        Assert.Equal(HttpStatusCode.NotFound, denied.StatusCode);

        _ = await SongBookTestHelpers.SetAccessAsync(owner, book.Id, readerEmail, "reader");
        using HttpResponseMessage allowed =
            await reader.GetAsync(AdjacentPath(book.Id, song.Id));
        Assert.Equal(HttpStatusCode.OK, allowed.StatusCode);
        AdjacentSongsResponse? result =
            await allowed.Content.ReadFromJsonAsync<AdjacentSongsResponse>();
        Assert.NotNull(result);
        Assert.Null(result.Previous);
        Assert.Null(result.Next);
    }

    private static async Task<PageResult<SongSummaryResponse>> GetSongsPageAsync(
        HttpClient client,
        Guid bookId,
        int page)
        => Assert.IsType<PageResult<SongSummaryResponse>>(
            await client.GetFromJsonAsync<PageResult<SongSummaryResponse>>(
                $"/songbooks/{bookId}/songs?page={page}"));

    private static async Task<AdjacentSongsResponse> GetAdjacentAsync(
        HttpClient client,
        Guid bookId,
        Guid songId)
        => Assert.IsType<AdjacentSongsResponse>(
            await client.GetFromJsonAsync<AdjacentSongsResponse>(
                AdjacentPath(bookId, songId)));

    private static string AdjacentPath(Guid bookId, Guid songId)
        => $"/songbooks/{bookId}/songs/{songId}/adjacent";
}
