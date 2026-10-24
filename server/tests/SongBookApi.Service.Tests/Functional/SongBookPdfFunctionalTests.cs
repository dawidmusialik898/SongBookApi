using System.Net;
using System.Net.Http.Json;
using System.Text;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SongBookApi.Domain;
using SongBookApi.Domain.Entities;
using SongBookApi.Domain.Services;
using SongBookApi.Infrastructure.Identity;
using SongBookApi.Service.Contracts;
using UglyToad.PdfPig;
using UglyToad.PdfPig.DocumentLayoutAnalysis.TextExtractor;

namespace SongBookApi.Service.Tests.Functional;

[Trait("Category", "Functional")]
public sealed class SongBookPdfFunctionalTests : IClassFixture<TestApplicationFactory>
{
    private readonly TestApplicationFactory _factory;

    public SongBookPdfFunctionalTests(TestApplicationFactory factory) => _factory = factory;

    [Fact]
    public async Task WholeAndSelectedBooksWithAndWithoutChordsAreSavedAndDownloadable()
    {
        using HttpClient owner = await CreateUserAsync("pdf-owner");
        SongBookResponse book = await SongBookTestHelpers.CreateBookAsync(owner, "Śpiewnik");
        SongResponse first = await SongBookTestHelpers.CreateSongAsync(
            owner, book.Id, "First song",
            [new
            {
                name = "Verse",
                text = "Alpha beta\nGamma",
                chords = new[] { new { offset = 0, symbol = "Gmaj7" } }
            }]);
        _ = await SongBookTestHelpers.CreateSongAsync(
            owner, book.Id, "Second song",
            [new { text = "Second verse" }]);

        SongBookPdfInfo chorded = await GenerateAsync(owner, book.Id, new { includeChords = true });
        SongBookPdfInfo plain = await GenerateAsync(owner, book.Id, new { includeChords = false });
        SongBookPdfInfo selected = await GenerateAsync(
            owner, book.Id, new { includeChords = true, songIds = new[] { first.Id } });

        Assert.True(chorded.IsWholeBook);
        Assert.Equal(2, chorded.SongCount);
        Assert.Empty(chorded.SelectedSongs);
        Assert.False(chorded.IsOutdated);
        Assert.True(chorded.IncludeChords);
        Assert.False(plain.IncludeChords);
        Assert.False(selected.IsWholeBook);
        Assert.Single(selected.SelectedSongs);
        Assert.Equal(first.Id, selected.SelectedSongs[0].Id);
        Assert.Equal("First song", selected.SelectedSongs[0].Title);
        Assert.Equal(1, selected.SongCount);
        Assert.InRange(chorded.GeneratedAtUtc, DateTimeOffset.UtcNow.AddMinutes(-2), DateTimeOffset.UtcNow);

        PageResult<SongBookPdfInfo> list = await ListAsync(owner, book.Id);
        Assert.Equal(3, list.Items.Count);
        Assert.Contains(list.Items, pdf => pdf.Id == chorded.Id);
        Assert.Contains(list.Items, pdf => pdf.Id == plain.Id);
        Assert.Contains(list.Items, pdf => pdf.Id == selected.Id);

        string withChords = await DownloadTextAsync(owner, book.Id, chorded.Id);
        string withoutChords = await DownloadTextAsync(owner, book.Id, plain.Id);
        string subset = await DownloadTextAsync(owner, book.Id, selected.Id);
        Assert.Contains("First song", withChords);
        Assert.Contains("Second song", withChords);
        Assert.Contains("Gmaj7", withChords);
        Assert.DoesNotContain("Gmaj7", withoutChords);
        Assert.Contains("Second song", withoutChords);
        Assert.Contains("First song", subset);
        Assert.DoesNotContain("Second song", subset);
        Assert.Contains("Gmaj7", subset);
    }

    [Fact]
    public async Task OnlyTheOwnerCanGenerateButEveryCurrentReaderCanDownload()
    {
        string readerEmail = Email("pdf-reader");
        string editorEmail = Email("pdf-editor");
        using HttpClient owner = await CreateUserAsync("pdf-shared-owner");
        using HttpClient reader =
            await AuthenticationTestHelpers.CreateConfirmedClientAsync(_factory, readerEmail);
        using HttpClient editor =
            await AuthenticationTestHelpers.CreateConfirmedClientAsync(_factory, editorEmail);
        using HttpClient stranger = await CreateUserAsync("pdf-stranger");
        using HttpClient anonymous = _factory.CreateSecureClient();
        SongBookResponse book = await SongBookTestHelpers.CreateBookAsync(owner, "Shared PDF");
        SongBookResponse another = await SongBookTestHelpers.CreateBookAsync(owner, "Another PDF");
        _ = await SongBookTestHelpers.SetAccessAsync(owner, book.Id, readerEmail, "reader");
        _ = await SongBookTestHelpers.SetAccessAsync(owner, book.Id, editorEmail, "editor");
        SongBookPdfInfo pdf = await GenerateAsync(owner, book.Id, new { includeChords = false });
        string listUrl = $"/songbooks/{book.Id}/pdfs";
        string fileUrl = $"{listUrl}/{pdf.Id}/download";

        foreach (HttpClient client in new[] { reader, editor })
        {
            Assert.Single((await ListAsync(client, book.Id)).Items);
            Assert.Equal(HttpStatusCode.OK, (await client.GetAsync(fileUrl)).StatusCode);
            using HttpResponseMessage denied =
                await AuthenticationTestHelpers.PostJsonWithAntiforgeryAsync(
                    client, listUrl, new { includeChords = true });
            Assert.Equal(HttpStatusCode.Forbidden, denied.StatusCode);
        }
        Assert.Equal(HttpStatusCode.NotFound, (await stranger.GetAsync(listUrl)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await stranger.GetAsync(fileUrl)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync(listUrl)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync(fileUrl)).StatusCode);
        Assert.Equal(
            HttpStatusCode.NotFound,
            (await owner.GetAsync($"/songbooks/{another.Id}/pdfs/{pdf.Id}/download")).StatusCode);

        using HttpResponseMessage revoke = await AuthenticationTestHelpers.DeleteWithAntiforgeryAsync(
            owner,
            $"/songbooks/{book.Id}/access/{(await SongBookTestHelpers.SetAccessAsync(owner, book.Id, readerEmail, "reader")).Id}");
        Assert.Equal(HttpStatusCode.NoContent, revoke.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await reader.GetAsync(listUrl)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await reader.GetAsync(fileUrl)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await editor.GetAsync(fileUrl)).StatusCode);
    }

    [Fact]
    public async Task ExistingFilesStayAvailableAndBecomeOutdatedAfterContentChanges()
    {
        using HttpClient owner = await CreateUserAsync("pdf-updates");
        SongBookResponse book = await SongBookTestHelpers.CreateBookAsync(owner, "Original name");
        SongResponse song = await SongBookTestHelpers.CreateSongAsync(
            owner, book.Id, "Original", [new { text = "Old lyrics" }]);
        SongBookPdfInfo withChords = await GenerateAsync(owner, book.Id, new { includeChords = true });
        SongBookPdfInfo plain = await GenerateAsync(owner, book.Id, new { includeChords = false });

        using HttpResponseMessage update = await AuthenticationTestHelpers.PutJsonWithAntiforgeryAsync(
            owner,
            $"/songbooks/{book.Id}/songs/{song.Id}",
            new { title = "Updated", parts = new[] { new { id = song.Parts[0].Id, text = "New lyrics" } } });
        Assert.Equal(HttpStatusCode.NoContent, update.StatusCode);
        Assert.All((await ListAsync(owner, book.Id)).Items, pdf => Assert.True(pdf.IsOutdated));
        string oldPdf = await DownloadTextAsync(owner, book.Id, plain.Id);
        Assert.Contains("Old lyrics", oldPdf);
        Assert.DoesNotContain("New lyrics", oldPdf);

        SongBookPdfInfo fresh = await GenerateAsync(owner, book.Id, new { includeChords = false });
        Assert.False(fresh.IsOutdated);
        Assert.Contains("New lyrics", await DownloadTextAsync(owner, book.Id, fresh.Id));
        string readerEmail = Email("pdf-updates-reader");
        using HttpClient reader =
            await AuthenticationTestHelpers.CreateConfirmedClientAsync(_factory, readerEmail);
        _ = await SongBookTestHelpers.SetAccessAsync(owner, book.Id, readerEmail, "reader");
        Assert.False((await ListAsync(reader, book.Id)).Items.Single(pdf => pdf.Id == fresh.Id).IsOutdated);

        using HttpResponseMessage rename = await AuthenticationTestHelpers.PutJsonWithAntiforgeryAsync(
            owner, $"/songbooks/{book.Id}", new { name = "Renamed book" });
        Assert.Equal(HttpStatusCode.NoContent, rename.StatusCode);
        Assert.All((await ListAsync(reader, book.Id)).Items, pdf => Assert.True(pdf.IsOutdated));
        Assert.Contains("Original name", await DownloadTextAsync(reader, book.Id, withChords.Id));

        SongBookPdfInfo newest = await GenerateAsync(owner, book.Id, new { includeChords = true });
        Assert.False(newest.IsOutdated);
        _ = await SongBookTestHelpers.CreateSongAsync(owner, book.Id, "Added later");
        Assert.True((await ListAsync(owner, book.Id)).Items.Single(pdf => pdf.Id == newest.Id).IsOutdated);
        using HttpResponseMessage delete = await AuthenticationTestHelpers.DeleteWithAntiforgeryAsync(
            owner, $"/songbooks/{book.Id}/songs/{song.Id}");
        Assert.Equal(HttpStatusCode.NoContent, delete.StatusCode);
        Assert.True((await ListAsync(owner, book.Id)).Items.Single(pdf => pdf.Id == newest.Id).IsOutdated);
    }

    [Fact]
    public async Task InvalidSelectionsAndMissingAntiforgeryDoNotSavePdfs()
    {
        using HttpClient owner = await CreateUserAsync("pdf-invalid");
        SongBookResponse book = await SongBookTestHelpers.CreateBookAsync(owner, "Selection");
        SongBookResponse other = await SongBookTestHelpers.CreateBookAsync(owner, "Elsewhere");
        SongResponse song = await SongBookTestHelpers.CreateSongAsync(owner, book.Id, "Inside");
        SongResponse foreign = await SongBookTestHelpers.CreateSongAsync(owner, other.Id, "Outside");
        string url = $"/songbooks/{book.Id}/pdfs";

        foreach (object invalid in new object[]
        {
            new { includeChords = true, songIds = Array.Empty<Guid>() },
            new { includeChords = true, songIds = new[] { song.Id, song.Id } },
            new { includeChords = true, songIds = new[] { foreign.Id } },
            new { includeChords = true, songIds = new[] { Guid.NewGuid() } },
            new { includeChords = true, songIds = new[] { Guid.Empty } },
            new { songIds = new[] { song.Id } }
        })
        {
            using HttpResponseMessage response =
                await AuthenticationTestHelpers.PostJsonWithAntiforgeryAsync(owner, url, invalid);
            Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        }
        using HttpResponseMessage noToken =
            await owner.PostAsJsonAsync(url, new { includeChords = false });
        Assert.Equal(HttpStatusCode.BadRequest, noToken.StatusCode);
        Assert.Empty((await ListAsync(owner, book.Id)).Items);
        Assert.Equal(HttpStatusCode.BadRequest, (await owner.GetAsync($"{url}?page=0")).StatusCode);
        Assert.Equal(
            HttpStatusCode.NotFound,
            (await owner.GetAsync($"{url}/{Guid.NewGuid()}/download")).StatusCode);
    }

    [Fact]
    public async Task PdfMetadataIsPagedAndFilesAreRemovedWithTheirBook()
    {
        using HttpClient owner = await CreateUserAsync("pdf-page");
        SongBookResponse book = await SongBookTestHelpers.CreateBookAsync(owner, "Pages");
        DateTimeOffset now = DateTimeOffset.UtcNow;
        await using (AsyncServiceScope scope = _factory.Services.CreateAsyncScope())
        {
            SongBookDbContext db = scope.ServiceProvider.GetRequiredService<SongBookDbContext>();
            db.SongBookPdfs.AddRange(Enumerable.Range(0, 51).Select(index => new SongBookPdf
            {
                Id = Guid.NewGuid(),
                SongBookId = book.Id,
                GeneratedAtUtc = now.AddSeconds(index),
                ContentRevision = 0,
                IncludeChords = false,
                IsWholeBook = true,
                SongCount = 0,
                SelectedSongsJson = "[]",
                Content = [37, 80, 68, 70]
            }));
            await db.SaveChangesAsync();
        }

        PageResult<SongBookPdfInfo> first = await ListAsync(owner, book.Id);
        PageResult<SongBookPdfInfo> second = await owner.GetFromJsonAsync<PageResult<SongBookPdfInfo>>(
            $"/songbooks/{book.Id}/pdfs?page=2") ?? throw new Exception("PDF page missing.");
        Assert.Equal(50, first.Items.Count);
        Assert.True(first.HasNext);
        Assert.Single(second.Items);
        Assert.False(second.HasNext);
        Assert.Equal(2, second.Page);
        Assert.True(first.Items[0].GeneratedAtUtc > second.Items[0].GeneratedAtUtc);

        using HttpResponseMessage deleted = await AuthenticationTestHelpers.DeleteWithAntiforgeryAsync(
            owner, $"/songbooks/{book.Id}");
        Assert.Equal(HttpStatusCode.NoContent, deleted.StatusCode);
        await using AsyncServiceScope checkScope = _factory.Services.CreateAsyncScope();
        SongBookDbContext checkDb = checkScope.ServiceProvider.GetRequiredService<SongBookDbContext>();
        Assert.False(await checkDb.SongBookPdfs.AnyAsync(pdf => pdf.SongBookId == book.Id));
    }

    private async Task<HttpClient> CreateUserAsync(string prefix) =>
        await AuthenticationTestHelpers.CreateConfirmedClientAsync(_factory, Email(prefix));

    private static string Email(string prefix) => $"{prefix}-{Guid.NewGuid():N}@example.test";

    private static async Task<SongBookPdfInfo> GenerateAsync(HttpClient owner, Guid bookId, object request)
    {
        using HttpResponseMessage response = await AuthenticationTestHelpers.PostJsonWithAntiforgeryAsync(
            owner, $"/songbooks/{bookId}/pdfs", request);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return Assert.IsType<SongBookPdfInfo>(
            await response.Content.ReadFromJsonAsync<SongBookPdfInfo>());
    }

    private static async Task<PageResult<SongBookPdfInfo>> ListAsync(HttpClient client, Guid bookId) =>
        Assert.IsType<PageResult<SongBookPdfInfo>>(
            await client.GetFromJsonAsync<PageResult<SongBookPdfInfo>>($"/songbooks/{bookId}/pdfs"));

    private static async Task<string> DownloadTextAsync(HttpClient client, Guid bookId, Guid pdfId)
    {
        using HttpResponseMessage response = await client.GetAsync(
            $"/songbooks/{bookId}/pdfs/{pdfId}/download");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("application/pdf", response.Content.Headers.ContentType?.MediaType);
        Assert.Equal("attachment", response.Content.Headers.ContentDisposition?.DispositionType);
        Assert.True(response.Headers.CacheControl?.NoStore);
        byte[] bytes = await response.Content.ReadAsByteArrayAsync();
        Assert.StartsWith("%PDF-", Encoding.ASCII.GetString(bytes, 0, 5));
        using PdfDocument document = PdfDocument.Open(new MemoryStream(bytes));
        return string.Join("\n", document.GetPages().Select(page =>
            ContentOrderTextExtractor.GetText(page)));
    }
}
