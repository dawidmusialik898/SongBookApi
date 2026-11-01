using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.Extensions.DependencyInjection;
using SongBookApi.Domain;
using SongBookApi.Domain.Entities;
using SongBookApi.Domain.Services;
using SongBookApi.Infrastructure.Identity;
using SongBookApi.Infrastructure.Repositories;
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

    [Fact]
    public async Task EffectiveOptionsPersistForEveryAllowedLayoutAndGenerationRecordsOnlyActivity()
    {
        using HttpClient owner = await CreateUserAsync("pdf-options");
        SongBookResponse book = await SongBookTestHelpers.CreateBookAsync(owner, "Options");
        SongResponse song = await SongBookTestHelpers.CreateSongAsync(owner, book.Id, "Probe", [new { text = "Bodyprobe" }]);
        SongBookPdfInfo defaults = await GenerateAsync(owner, book.Id, new { includeChords = false });
        Assert.Equal(("lato", 10, "portrait", 1),
            (defaults.FontFamily, defaults.FontSize, defaults.Orientation, defaults.Columns));
        foreach (string orientation in new[] { "portrait", "landscape" })
        {
            foreach (int columns in Enumerable.Range(1, orientation == "portrait" ? 2 : 3))
            {
                foreach (string fontFamily in new[] { "lato", "dejavu-sans-mono" })
                {
                    foreach (int fontSize in new[] { 8, 18 })
                    {
                        SongBookPdfInfo pdf = await GenerateAsync(owner, book.Id, new
                        {
                            includeChords = false,
                            songIds = new[] { song.Id },
                            fontFamily,
                            fontSize,
                            orientation,
                            columns
                        });
                        SongBookPdfInfo listed = (await ListAsync(owner, book.Id)).Items.Single(item => item.Id == pdf.Id);
                        Assert.Equal((fontFamily, fontSize, orientation, columns),
                            (listed.FontFamily, listed.FontSize, listed.Orientation, listed.Columns));
                        Assert.False(listed.IsOutdated);
                        using var document = PdfDocument.Open(await owner.GetByteArrayAsync(
                            $"/songbooks/{book.Id}/pdfs/{pdf.Id}/download"));
                        Assert.Equal(orientation == "portrait" ? 595.28 : 841.89, document.GetPage(1).Width, 0.5);
                    }
                }
            }
        }

        SongBookPdfInfo omittedColumns = await GenerateAsync(owner, book.Id,
            new { includeChords = true, orientation = "landscape" });
        Assert.Equal(1, omittedColumns.Columns);
        await using AsyncServiceScope scope = _factory.Services.CreateAsyncScope();
        SongBookDbContext db = scope.ServiceProvider.GetRequiredService<SongBookDbContext>();
        Assert.Equal(1, (await db.Songs.SingleAsync(value => value.Id == song.Id)).Revision);
        Assert.Equal(1, await db.SongRevisions.CountAsync(value => value.SongId == song.Id));
        Assert.Equal(1, (await db.SongBooks.SingleAsync(value => value.Id == book.Id)).ContentRevision);
        Assert.Equal(SongBookApi.Service.Services.SongBookPdfService.RetainedPdfsPerBook,
            await db.SongBookPdfs.CountAsync(value => value.SongBookId == book.Id));
        var activities = await db.BookActivities.Where(value => value.SongBookId == book.Id && value.Operation == "pdf.generated")
            .ToListAsync();
        Assert.Equal(22, activities.Count);
        Assert.All(activities, activity =>
        {
            Assert.NotNull(activity.ActorId);
            Assert.Null(activity.SongId);
            Assert.Null(activity.Revision);
        });
        Assert.False((await ListAsync(owner, book.Id)).Items.Single(value => value.Id == omittedColumns.Id).IsOutdated);
    }

    [Theory]
    [InlineData("fontFamily", "\"Arial\"")]
    [InlineData("fontFamily", "\"Lato\"")]
    [InlineData("fontFamily", "\"\"")]
    [InlineData("fontSize", "7")]
    [InlineData("fontSize", "19")]
    [InlineData("fontSize", "8.5")]
    [InlineData("orientation", "\"diagonal\"")]
    [InlineData("columns", "0")]
    [InlineData("columns", "3")]
    [InlineData("columns", "1.5")]
    public async Task InvalidOptionsReturnFieldSpecificErrorsWithoutSaving(string field, string json)
    {
        using HttpClient owner = await CreateUserAsync("pdf-invalid-options");
        SongBookResponse book = await SongBookTestHelpers.CreateBookAsync(owner, "Invalid options");
        var request = new Dictionary<string, object>
        {
            ["includeChords"] = true,
            [field] = JsonSerializer.Deserialize<JsonElement>(json)
        };
        using HttpResponseMessage response = await AuthenticationTestHelpers.PostJsonWithAntiforgeryAsync(
            owner, $"/songbooks/{book.Id}/pdfs", request);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        using JsonDocument problem = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.True(problem.RootElement.GetProperty("errors").TryGetProperty(field, out _));
        Assert.Empty((await ListAsync(owner, book.Id)).Items);
        await using AsyncServiceScope scope = _factory.Services.CreateAsyncScope();
        SongBookDbContext db = scope.ServiceProvider.GetRequiredService<SongBookDbContext>();
        Assert.False(await db.BookActivities.AnyAsync(value => value.SongBookId == book.Id && value.Operation == "pdf.generated"));
    }

    [Fact]
    public async Task PdfMigrationDefaultsExistingRowsWithoutTouchingBytesAndMatchesFreshDatabase()
    {
        await using var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync();
        var options = new DbContextOptionsBuilder<SongBookDbContext>().UseSqlite(connection).Options;
        await using var db = new SongBookDbContext(options);
        var migrator = db.GetService<IMigrator>();
        await migrator.MigrateAsync("20261031224223_AddActivitySubjects");
        Guid bookId = Guid.NewGuid(), pdfId = Guid.NewGuid();
        byte[] bytes = [37, 80, 68, 70, 45, 49, 46, 55];
        await db.Database.ExecuteSqlInterpolatedAsync($"""
            INSERT INTO AspNetUsers (Id, UserName, EmailConfirmed, PhoneNumberConfirmed, TwoFactorEnabled, LockoutEnabled, AccessFailedCount, IsBanned)
            VALUES ('pdf-migration-owner', 'owner', 0, 0, 0, 0, 0, 0);
            INSERT INTO SongBooks (Id, Name, NormalizedName, OwnerId, CreatedAtUtc, UpdatedAtUtc, ContentRevision)
            VALUES ({bookId}, 'Old book', 'OLD BOOK', 'pdf-migration-owner', {DateTimeOffset.UnixEpoch}, {DateTimeOffset.UnixEpoch}, 5);
            INSERT INTO SongBookPdfs (Id, SongBookId, GeneratedAtUtc, ContentRevision, IncludeChords, IsWholeBook, SongCount, SelectedSongsJson, Content)
            VALUES ({pdfId}, {bookId}, 0, 4, 1, 1, 0, '[]', {bytes});
            """);
        await migrator.MigrateAsync();
        SongBookPdf old = await db.SongBookPdfs.SingleAsync();
        Assert.Equal(bytes, old.Content);
        Assert.Equal(("lato", 10, "portrait", 1), (old.FontFamily, old.FontSize, old.Orientation, old.Columns));
        Assert.Equal(4, old.ContentRevision);
        Assert.Equal(5, (await db.SongBooks.SingleAsync()).ContentRevision);
        Assert.Empty(await db.BookActivities.ToListAsync());
        Assert.False(db.Database.HasPendingModelChanges());
        Assert.Empty(await db.Database.GetPendingMigrationsAsync());
        await using var freshConnection = new SqliteConnection("Data Source=:memory:");
        await freshConnection.OpenAsync();
        await using var fresh = new SongBookDbContext(
            new DbContextOptionsBuilder<SongBookDbContext>().UseSqlite(freshConnection).Options);
        await fresh.Database.MigrateAsync();
        Assert.False(fresh.Database.HasPendingModelChanges());
        Assert.Equal(await db.Database.GetAppliedMigrationsAsync(), await fresh.Database.GetAppliedMigrationsAsync());
    }

    [Fact]
    public async Task FailedPdfSaveRollsBackStagedActivityAndFileTogether()
    {
        await using var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync();
        var options = new DbContextOptionsBuilder<SongBookDbContext>().UseSqlite(connection).Options;
        Guid bookId = Guid.NewGuid();
        await using (var db = new SongBookDbContext(options))
        {
            await db.Database.MigrateAsync();
            db.Users.Add(new ApplicationUser { Id = "pdf-rollback-owner", UserName = "Owner" });
            db.SongBooks.Add(new SongBook
            {
                Id = bookId,
                Name = "Rollback",
                NormalizedName = "ROLLBACK",
                OwnerId = "pdf-rollback-owner"
            });
            await db.SaveChangesAsync();
            var mutation = new CurrentMutation { Current = new MutationContext("nonexistent-actor") };
            var repository = new EfSongBookPdfRepository(db, new EfActivityWriter(db, mutation));
            await Assert.ThrowsAsync<DbUpdateException>(() => repository.AddAsync(new SongBookPdf
            {
                Id = Guid.NewGuid(),
                SongBookId = bookId,
                Content = [37, 80, 68, 70],
                SelectedSongsJson = "[]"
            }));
        }

        await using var check = new SongBookDbContext(options);
        Assert.Empty(await check.SongBookPdfs.ToListAsync());
        Assert.Empty(await check.BookActivities.ToListAsync());
        Assert.Equal(0, (await check.SongBooks.SingleAsync()).ContentRevision);
    }

    [Fact]
    public async Task GeneratingBeyondTheRetentionLimitRemovesTheOldestPdfs()
    {
        using HttpClient owner = await CreateUserAsync("pdf-retention");
        SongBookResponse book = await SongBookTestHelpers.CreateBookAsync(owner, "Retention");
        SongBookResponse other = await SongBookTestHelpers.CreateBookAsync(owner, "Untouched");
        SongBookPdfInfo otherPdf = await GenerateAsync(owner, other.Id, new { includeChords = false });
        List<SongBookPdfInfo> generated = [];
        for (int index = 0; index <= SongBookApi.Service.Services.SongBookPdfService.RetainedPdfsPerBook; index++)
        {
            generated.Add(await GenerateAsync(owner, book.Id, new { includeChords = false }));
        }

        Guid[] listed = [.. (await ListAsync(owner, book.Id)).Items.Select(pdf => pdf.Id)];
        Assert.Equal(SongBookApi.Service.Services.SongBookPdfService.RetainedPdfsPerBook, listed.Length);
        Assert.DoesNotContain(generated[0].Id, listed);
        Assert.All(generated.Skip(1), pdf => Assert.Contains(pdf.Id, listed));
        Assert.Equal(HttpStatusCode.NotFound,
            (await owner.GetAsync($"/songbooks/{book.Id}/pdfs/{generated[0].Id}/download")).StatusCode);
        Assert.Equal(otherPdf.Id, Assert.Single((await ListAsync(owner, other.Id)).Items).Id);
    }

    [Fact]
    public async Task PdfGenerationIsRateLimitedPerUser()
    {
        using TestApplicationFactory factory = new() { UseProductionUserRateLimits = true };
        using HttpClient owner = await AuthenticationTestHelpers.CreateConfirmedClientAsync(
            factory, Email("pdf-limit-owner"));
        using HttpClient another = await AuthenticationTestHelpers.CreateConfirmedClientAsync(
            factory, Email("pdf-limit-other"));
        SongBookResponse book = await SongBookTestHelpers.CreateBookAsync(owner, "Limited");
        SongBookResponse otherBook = await SongBookTestHelpers.CreateBookAsync(another, "Other");

        for (int index = 0; index < 10; index++)
        {
            _ = await GenerateAsync(owner, book.Id, new { includeChords = false });
        }

        using HttpResponseMessage limited = await AuthenticationTestHelpers.PostJsonWithAntiforgeryAsync(
            owner, $"/songbooks/{book.Id}/pdfs", new { includeChords = false });
        Assert.Equal(HttpStatusCode.TooManyRequests, limited.StatusCode);
        _ = await GenerateAsync(another, otherBook.Id, new { includeChords = false });
    }

    private async Task<HttpClient> CreateUserAsync(string prefix)
        => await AuthenticationTestHelpers.CreateConfirmedClientAsync(_factory, Email(prefix));

    private static string Email(string prefix) => $"{prefix}-{Guid.NewGuid():N}@example.test";

    private static async Task<SongBookPdfInfo> GenerateAsync(HttpClient owner, Guid bookId, object request)
    {
        using HttpResponseMessage response = await AuthenticationTestHelpers.PostJsonWithAntiforgeryAsync(
            owner, $"/songbooks/{bookId}/pdfs", request);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return Assert.IsType<SongBookPdfInfo>(
            await response.Content.ReadFromJsonAsync<SongBookPdfInfo>());
    }

    private static async Task<PageResult<SongBookPdfInfo>> ListAsync(HttpClient client, Guid bookId)
        => Assert.IsType<PageResult<SongBookPdfInfo>>(
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
        using var document = PdfDocument.Open(new MemoryStream(bytes));
        return string.Join("\n", document.GetPages().Select(page =>
            ContentOrderTextExtractor.GetText(page)));
    }
}