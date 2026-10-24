using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using SongBookApi.Domain;
using SongBookApi.Service.Contracts;

namespace SongBookApi.Service.Tests.Functional;

[Trait("Category", "Functional")]
public sealed class SongSearchFunctionalTests : IClassFixture<SongBookApiFactory>
{
    private readonly SongBookApiFactory _factory;

    public SongSearchFunctionalTests(SongBookApiFactory factory) => _factory = factory;

    [Fact]
    public async Task SearchMatchesTitleAuthorNumberAndOriginalTitleIgnoringCaseAndDiacritics()
    {
        using HttpClient owner = await AuthenticationTestHelpers.CreateConfirmedClientAsync(
            _factory,
            $"song-search-{Guid.NewGuid():N}@example.test");
        SongBookResponse book = await SongBookTestHelpers.CreateBookAsync(owner, "Search fields");
        SongResponse song = await SongBookTestHelpers.CreateSongWithFieldsAsync(
            owner,
            book.Id,
            new
            {
                title = "Ślicznie Gwiazdeczko",
                author = "Elżbieta",
                originalTitle = "Łódź Hymn",
                number = "42",
                parts = Array.Empty<object>()
            });

        foreach (string query in new[]
        {
            "SLICZNIE",
            "elzbieta",
            "42",
            "lodz",
            "slicznie   elzbieta"
        })
        {
            PageResult<SongSummaryResponse> result =
                await GetSearchPageAsync(owner, book.Id, query);
            Assert.True(
                result.Items.Select(item => item.Id).SequenceEqual(new[] { song.Id }),
                $"Search query '{query}' did not return the song.");
        }
    }

    [Fact]
    public async Task WhitespaceOnlySearchReturnsTheUnfilteredPage()
    {
        using HttpClient owner = await AuthenticationTestHelpers.CreateConfirmedClientAsync(
            _factory,
            $"song-search-empty-{Guid.NewGuid():N}@example.test");
        SongBookResponse book = await SongBookTestHelpers.CreateBookAsync(owner, "Empty search");
        _ = await SongBookTestHelpers.CreateSongAsync(owner, book.Id, "Morning");
        _ = await SongBookTestHelpers.CreateSongAsync(owner, book.Id, "Evening");

        PageResult<SongSummaryResponse> unfiltered = await GetSongsPageAsync(owner, book.Id);
        PageResult<SongSummaryResponse> whitespace =
            await GetSearchPageAsync(owner, book.Id, " \t  ");

        Assert.Equal(unfiltered.Items, whitespace.Items);
        Assert.Equal(unfiltered.Page, whitespace.Page);
        Assert.Equal(unfiltered.HasNext, whitespace.HasNext);
    }

    [Fact]
    public async Task SearchLengthIsTrimmedAndValidatedBeforeBookAccess()
    {
        using HttpClient owner = await AuthenticationTestHelpers.CreateConfirmedClientAsync(
            _factory,
            $"song-search-length-{Guid.NewGuid():N}@example.test");
        using HttpClient other = await AuthenticationTestHelpers.CreateConfirmedClientAsync(
            _factory,
            $"song-search-other-{Guid.NewGuid():N}@example.test");
        SongBookResponse book = await SongBookTestHelpers.CreateBookAsync(owner, "Search length");

        using HttpResponseMessage maximumLength = await owner.GetAsync(
            SearchPath(book.Id, $"  {new string('x', 100)}  "));
        Assert.Equal(HttpStatusCode.OK, maximumLength.StatusCode);

        using HttpResponseMessage tooLong = await other.GetAsync(
            SearchPath(book.Id, new string('x', 101)));
        Assert.Equal(HttpStatusCode.BadRequest, tooLong.StatusCode);
        using var problem =
            JsonDocument.Parse(await tooLong.Content.ReadAsStringAsync());
        Assert.True(problem.RootElement
            .GetProperty("errors")
            .TryGetProperty("search", out _));

        using HttpResponseMessage inaccessible = await other.GetAsync(
            SearchPath(book.Id, "ordinary query"));
        Assert.Equal(HttpStatusCode.NotFound, inaccessible.StatusCode);
    }

    [Fact]
    public async Task SearchFiltersBeforePagingAndReportsLookahead()
    {
        using HttpClient owner = await AuthenticationTestHelpers.CreateConfirmedClientAsync(
            _factory,
            $"song-search-pages-{Guid.NewGuid():N}@example.test");
        SongBookResponse book = await SongBookTestHelpers.CreateBookAsync(owner, "Search pages");
        for (int index = 0; index < 55; index++)
        {
            _ = await SongBookTestHelpers.CreateSongWithFieldsAsync(
                owner,
                book.Id,
                new
                {
                    title = $"Common song {index:D2}",
                    parts = Array.Empty<object>()
                });
        }

        _ = await SongBookTestHelpers.CreateSongWithFieldsAsync(
            owner,
            book.Id,
            new { title = "Unrelated song", parts = Array.Empty<object>() });

        PageResult<SongSummaryResponse> first =
            await GetSearchPageAsync(owner, book.Id, "common", 1);
        PageResult<SongSummaryResponse> second =
            await GetSearchPageAsync(owner, book.Id, "common", 2);

        Assert.Equal(50, first.Items.Count);
        Assert.True(first.HasNext);
        Assert.Equal(1, first.Page);
        Assert.Equal(5, second.Items.Count);
        Assert.False(second.HasNext);
        Assert.Equal(2, second.Page);
        Assert.All(first.Items.Concat(second.Items),
            item => Assert.StartsWith("Common", item.Title ?? string.Empty));
    }

    [Fact]
    public async Task SearchPreservesTheUnfilteredCanonicalSongOrder()
    {
        using HttpClient owner = await AuthenticationTestHelpers.CreateConfirmedClientAsync(
            _factory,
            $"song-search-order-{Guid.NewGuid():N}@example.test");
        SongBookResponse book = await SongBookTestHelpers.CreateBookAsync(owner, "Search order");
        foreach (string title in new[]
        {
            "Zulu needle",
            "Alpha needle",
            "Beta unrelated",
            "Charlie needle"
        })
        {
            _ = await SongBookTestHelpers.CreateSongWithFieldsAsync(
                owner,
                book.Id,
                new { title, parts = Array.Empty<object>() });
        }

        PageResult<SongSummaryResponse> unfiltered =
            await GetSongsPageAsync(owner, book.Id);
        PageResult<SongSummaryResponse> filtered =
            await GetSearchPageAsync(owner, book.Id, "needle");
        Guid[] expected = [.. unfiltered.Items
            .Where(item => item.Title?.Contains("needle", StringComparison.OrdinalIgnoreCase) == true)
            .Select(item => item.Id)];

        Assert.Equal(expected, filtered.Items.Select(item => item.Id));
    }

    [Fact]
    public async Task SearchReturnsNotFoundWithoutAccessAndAllowsReaderAccess()
    {
        string readerEmail = $"song-search-reader-{Guid.NewGuid():N}@example.test";
        using HttpClient owner = await AuthenticationTestHelpers.CreateConfirmedClientAsync(
            _factory,
            $"song-search-owner-{Guid.NewGuid():N}@example.test");
        using HttpClient reader =
            await AuthenticationTestHelpers.CreateConfirmedClientAsync(_factory, readerEmail);
        SongBookResponse book = await SongBookTestHelpers.CreateBookAsync(owner, "Shared search");
        SongResponse song = await SongBookTestHelpers.CreateSongWithFieldsAsync(
            owner,
            book.Id,
            new { title = "Searchable", parts = Array.Empty<object>() });

        using HttpResponseMessage denied =
            await reader.GetAsync(SearchPath(book.Id, "searchable"));
        Assert.Equal(HttpStatusCode.NotFound, denied.StatusCode);

        _ = await SongBookTestHelpers.SetAccessAsync(owner, book.Id, readerEmail, "reader");
        PageResult<SongSummaryResponse> allowed =
            await GetSearchPageAsync(reader, book.Id, "searchable");
        Assert.Equal(new[] { song.Id }, allowed.Items.Select(item => item.Id));
    }

    private static async Task<PageResult<SongSummaryResponse>> GetSongsPageAsync(
        HttpClient client,
        Guid bookId,
        int page = 1)
        => Assert.IsType<PageResult<SongSummaryResponse>>(
            await client.GetFromJsonAsync<PageResult<SongSummaryResponse>>(
                $"/songbooks/{bookId}/songs?page={page}"));

    private static async Task<PageResult<SongSummaryResponse>> GetSearchPageAsync(
        HttpClient client,
        Guid bookId,
        string search,
        int page = 1)
        => Assert.IsType<PageResult<SongSummaryResponse>>(
            await client.GetFromJsonAsync<PageResult<SongSummaryResponse>>(
                SearchPath(bookId, search, page)));

    private static string SearchPath(Guid bookId, string search, int page = 1)
        => $"/songbooks/{bookId}/songs?search={Uri.EscapeDataString(search)}&page={page}";
}
