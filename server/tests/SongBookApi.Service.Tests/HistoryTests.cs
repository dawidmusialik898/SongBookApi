using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.Extensions.DependencyInjection;
using SongBookApi.Domain;
using SongBookApi.Domain.Dto;
using SongBookApi.Domain.Entities;
using SongBookApi.Domain.Services;
using SongBookApi.Infrastructure.Identity;
using SongBookApi.Infrastructure.Repositories;
using SongBookApi.Service.Contracts;

namespace SongBookApi.Service.Tests;

public sealed class HistoryTests : IClassFixture<TestApplicationFactory>
{
    private readonly TestApplicationFactory factory;
    public HistoryTests(TestApplicationFactory factory) => this.factory = factory;

    [Fact]
    public async Task FullImmutableLineageRestoresRemovedPartsAndDeletedSongsWithOnePdfIncrement()
    {
        string email = $"history-{Guid.NewGuid():N}@example.test";
        using HttpClient owner = await AuthenticationTestHelpers.CreateConfirmedClientAsync(factory, email);
        SongBookResponse book = await SongBookTestHelpers.CreateBookAsync(owner, "History");
        SongResponse original = await SongBookTestHelpers.CreateSongWithFieldsAsync(owner, book.Id, new
        {
            title = "<Original>",
            author = "Author",
            originalTitle = "Old title",
            number = "7",
            key = "Am",
            tempo = "120",
            parts = new[]
            {
                new { name = "Verse", text = "😀Żółć\r\nexact ", chords = new[] { new { offset = 0, symbol = "C" }, new { offset = 2, symbol = "Am" } } },
                new { name = "Chorus", text = "Return", chords = new[] { new { offset = 1, symbol = "G" } } }
            },
            actorId = "spoofed",
            occurredAtUtc = "1900-01-01"
        });
        string path = $"/songbooks/{book.Id}/songs/{original.Id}";
        Assert.Equal(1, original.Revision);
        RevisionDetail snapshot = (await owner.GetFromJsonAsync<RevisionDetail>($"{path}/history/1"))!;
        Assert.Equal(email, snapshot.Summary.Actor);
        Assert.Equal("song.created", snapshot.Summary.Operation);
        Assert.True(snapshot.Summary.OccurredAtUtc > DateTimeOffset.UtcNow.AddMinutes(-5));
        Assert.Equal("😀Żółć\r\nexact ", snapshot.Snapshot.Song.Parts[0].Text);
        Assert.Equal(new[] { 0, 2 }, snapshot.Snapshot.Song.Parts[0].Chords!.Select(chord => chord.Offset));
        string immutableJson = JsonSerializer.Serialize(snapshot.Snapshot);

        using (var response = await AuthenticationTestHelpers.PutJsonWithAntiforgeryAsync(owner, path,
            new { title = "Changed", expectedRevision = 1, parts = new[] { new { id = original.Parts[1].Id, name = "Chorus changed", text = "New", chords = Array.Empty<object>() } } }))
            Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        SongResponse changed = (await owner.GetFromJsonAsync<SongResponse>(path))!;
        Assert.Equal(2, changed.Revision);
        Assert.Equal(immutableJson, JsonSerializer.Serialize((await owner.GetFromJsonAsync<RevisionDetail>($"{path}/history/1"))!.Snapshot));
        long pdfBefore = await ContentRevision(book.Id);
        using (var restore = await AuthenticationTestHelpers.PostJsonWithAntiforgeryAsync(owner, $"{path}/history/1/restore", new { expectedRevision = 2 }))
            Assert.Equal(HttpStatusCode.OK, restore.StatusCode);
        Assert.Equal(pdfBefore + 1, await ContentRevision(book.Id));
        SongResponse restored = (await owner.GetFromJsonAsync<SongResponse>(path))!;
        Assert.Equal(3, restored.Revision);
        Assert.Equal(original.Parts.Select(part => part.Id), restored.Parts.Select(part => part.Id));
        Assert.Equal(original.Title, restored.Title);
        Assert.Equal(original.Author, restored.Author);
        Assert.Equal(original.OriginalTitle, restored.OriginalTitle);
        Assert.Equal(original.Number, restored.Number);
        Assert.Equal(original.Key, restored.Key);
        Assert.Equal(original.Tempo, restored.Tempo);
        Assert.Equal(JsonSerializer.Serialize(original.Parts), JsonSerializer.Serialize(restored.Parts));
        using (var stale = await AuthenticationTestHelpers.DeleteWithAntiforgeryAsync(owner, $"{path}?expectedRevision=2"))
            Assert.Equal(HttpStatusCode.Conflict, stale.StatusCode);
        using (var deleted = await AuthenticationTestHelpers.DeleteWithAntiforgeryAsync(owner, $"{path}?expectedRevision=3"))
            Assert.Equal(HttpStatusCode.NoContent, deleted.StatusCode);
        SongHistory deletedHistory = (await owner.GetFromJsonAsync<SongHistory>($"{path}/history"))!;
        Assert.True(deletedHistory.Deleted);
        Assert.Equal(4, deletedHistory.LatestRevision);
        Assert.Equal(new long[] { 4, 3, 2, 1 }, deletedHistory.Revisions.Items.Select(entry => entry.Revision));
        Assert.Equal("song.deleted", deletedHistory.Revisions.Items[0].Operation);
        pdfBefore = await ContentRevision(book.Id);
        using (var stale = await AuthenticationTestHelpers.PostJsonWithAntiforgeryAsync(owner, $"{path}/history/1/restore", new { expectedRevision = 3 }))
            Assert.Equal(HttpStatusCode.Conflict, stale.StatusCode);
        using (var restore = await AuthenticationTestHelpers.PostJsonWithAntiforgeryAsync(owner, $"{path}/history/1/restore", new { expectedRevision = 4 }))
            Assert.Equal(HttpStatusCode.OK, restore.StatusCode);
        Assert.Equal(pdfBefore + 1, await ContentRevision(book.Id));
        var recovered = (await owner.GetFromJsonAsync<SongResponse>(path))!;
        Assert.Equal(5, recovered.Revision);
        Assert.Equal(original.Id, recovered.Id);
        Assert.Equal(JsonSerializer.Serialize(original.Parts), JsonSerializer.Serialize(recovered.Parts));
        var recovery = (await owner.GetFromJsonAsync<RevisionDetail>($"{path}/history/5"))!;
        Assert.Equal(1, recovery.Summary.RestoredFromRevision);
        Assert.Equal(email, recovery.Summary.Actor);
        Assert.Equal("song.restored", recovery.Summary.Operation);

        using (var deletion = await AuthenticationTestHelpers.DeleteWithAntiforgeryAsync(owner, $"/songbooks/{book.Id}"))
            Assert.Equal(HttpStatusCode.NoContent, deletion.StatusCode);
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<SongBookDbContext>();
        Assert.False(await db.SongRevisions.AnyAsync(entry => entry.SongBookId == book.Id));
        Assert.False(await db.BookActivities.AnyAsync(entry => entry.SongBookId == book.Id));
        Assert.Equal(HttpStatusCode.NotFound, (await owner.GetAsync($"{path}/history")).StatusCode);
        using var denied = await AuthenticationTestHelpers.PostJsonWithAntiforgeryAsync(owner, $"{path}/history/1/restore", new { expectedRevision = 5 });
        Assert.Equal(HttpStatusCode.NotFound, denied.StatusCode);
    }

    [Fact]
    public async Task HistoryPrivacyAntiforgeryAttributionAndDeletedActor()
    {
        using HttpClient owner = await User("owner");
        string editorEmail = $"editor-{Guid.NewGuid():N}@example.test";
        using HttpClient editor = await AuthenticationTestHelpers.CreateConfirmedClientAsync(factory, editorEmail);
        string readerEmail = $"reader-{Guid.NewGuid():N}@example.test";
        using HttpClient reader = await AuthenticationTestHelpers.CreateConfirmedClientAsync(factory, readerEmail);
        using HttpClient outsider = await User("outsider");
        using HttpClient anonymous = factory.CreateSecureClient();
        var book = await SongBookTestHelpers.CreateBookAsync(owner, "Privacy");
        await SongBookTestHelpers.SetAccessAsync(owner, book.Id, editorEmail, "editor");
        var readerAccess = await SongBookTestHelpers.SetAccessAsync(owner, book.Id, readerEmail, "reader");
        await SongBookTestHelpers.SetAccessAsync(owner, book.Id, readerEmail, "editor");
        await SongBookTestHelpers.SetAccessAsync(owner, book.Id, readerEmail, "reader");
        var song = await SongBookTestHelpers.CreateSongAsync(editor, book.Id);
        string path = $"/songbooks/{book.Id}/songs/{song.Id}";
        using (var rename = await AuthenticationTestHelpers.PutJsonWithAntiforgeryAsync(owner, $"/songbooks/{book.Id}", new { name = "Renamed" }))
            Assert.Equal(HttpStatusCode.NoContent, rename.StatusCode);
        var ownerFeed = (await owner.GetFromJsonAsync<PageResult<ActivitySummary>>($"/songbooks/{book.Id}/history"))!;
        Assert.Contains(ownerFeed.Items, entry => entry.Operation == "book.created");
        Assert.Contains(ownerFeed.Items, entry => entry.Operation == "book.renamed");
        Assert.Contains(ownerFeed.Items, entry => entry.Operation == "collaborator.added");
        Assert.Contains(ownerFeed.Items, entry => entry.Operation == "collaborator.changed");
        Assert.Contains(ownerFeed.Items, entry => entry.Operation == "collaborator.changed" && entry.Subject == readerEmail);
        var readerFeed = (await reader.GetFromJsonAsync<PageResult<ActivitySummary>>($"/songbooks/{book.Id}/history"))!;
        Assert.DoesNotContain(readerFeed.Items, entry => entry.Operation.StartsWith("collaborator"));
        Assert.Contains(readerFeed.Items, entry => entry.Operation == "song.created" && entry.Actor == editorEmail);
        foreach (string url in new[] { $"/songbooks/{book.Id}/history", $"{path}/history", $"{path}/history/1" })
        {
            Assert.Equal(HttpStatusCode.OK, (await reader.GetAsync(url)).StatusCode);
            Assert.Equal(HttpStatusCode.NotFound, (await outsider.GetAsync(url)).StatusCode);
            Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync(url)).StatusCode);
        }
        using (var missingCsrf = await editor.PostAsJsonAsync($"{path}/history/1/restore", new { expectedRevision = 1 }))
            Assert.Equal(HttpStatusCode.BadRequest, missingCsrf.StatusCode);
        using (var forbidden = await AuthenticationTestHelpers.PostJsonWithAntiforgeryAsync(reader, $"{path}/history/1/restore", new { expectedRevision = 1 }))
            Assert.Equal(HttpStatusCode.Forbidden, forbidden.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await reader.GetAsync($"{path}/history?page=0")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await reader.GetAsync($"{path}/history/0")).StatusCode);
        using (var missingExpected = await AuthenticationTestHelpers.PostJsonWithAntiforgeryAsync(editor, $"{path}/history/1/restore", new { }))
            Assert.Equal(HttpStatusCode.BadRequest, missingExpected.StatusCode);
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<SongBookDbContext>();
            var actor = await db.Users.SingleAsync(user => user.Email == editorEmail);
            db.Users.Remove(actor);
            await db.SaveChangesAsync();
            Assert.Null((await db.SongRevisions.SingleAsync(entry => entry.SongId == song.Id)).ActorId);
        }
        var snapshot = (await reader.GetFromJsonAsync<RevisionDetail>($"{path}/history/1"))!;
        Assert.Equal("Deleted user", snapshot.Summary.Actor);
        Assert.DoesNotContain(editorEmail, JsonSerializer.Serialize(snapshot.Snapshot));
        using (var removed = await AuthenticationTestHelpers.DeleteWithAntiforgeryAsync(owner, $"/songbooks/{book.Id}/access/{readerAccess.Id}"))
            Assert.Equal(HttpStatusCode.NoContent, removed.StatusCode);
        Assert.Contains((await owner.GetFromJsonAsync<PageResult<ActivitySummary>>($"/songbooks/{book.Id}/history"))!.Items,
            entry => entry.Operation == "collaborator.removed");
    }

    [Fact]
    public async Task ExistingSongBaselineIsLazyAndFailedPartOrChordValidationLeavesNoHistory()
    {
        using var owner = await User("baseline");
        var book = await SongBookTestHelpers.CreateBookAsync(owner, "Baseline");
        var existing = new Song { SongBookId = book.Id, Title = "Imported", Parts = [new Part { Name = "Old", Text = "unchanged" }] };
        existing.Parts[0].SongId = existing.Id;
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<SongBookDbContext>();
            db.Songs.Add(existing);
            await db.SaveChangesAsync();
        }
        string path = $"/songbooks/{book.Id}/songs/{existing.Id}";
        var history = (await owner.GetFromJsonAsync<SongHistory>($"{path}/history"))!;
        Assert.Empty(history.Revisions.Items);
        long pdfBefore = await ContentRevision(book.Id);
        using (var badPart = await AuthenticationTestHelpers.PutJsonWithAntiforgeryAsync(owner, path,
            new { expectedRevision = 0, title = "Failed", parts = new[] { new { id = Guid.NewGuid(), text = "bad" } } }))
            Assert.Equal(HttpStatusCode.BadRequest, badPart.StatusCode);
        using (var badChord = await AuthenticationTestHelpers.PutJsonWithAntiforgeryAsync(owner, path,
            new { expectedRevision = 0, parts = new[] { new { id = existing.Parts[0].Id, text = "😀", chords = new[] { new { offset = 1, symbol = "C" } } } } }))
            Assert.Equal(HttpStatusCode.BadRequest, badChord.StatusCode);
        Assert.Empty((await owner.GetFromJsonAsync<SongHistory>($"{path}/history"))!.Revisions.Items);
        Assert.Equal(pdfBefore, await ContentRevision(book.Id));
        Assert.Equal("Imported", (await owner.GetFromJsonAsync<SongResponse>(path))!.Title);
        using (var edit = await AuthenticationTestHelpers.PutJsonWithAntiforgeryAsync(owner, path,
            new { expectedRevision = 0, title = "Tracked", parts = Array.Empty<object>() }))
            Assert.Equal(HttpStatusCode.NoContent, edit.StatusCode);
        var baseline = (await owner.GetFromJsonAsync<RevisionDetail>($"{path}/history/1"))!;
        Assert.Equal("baseline", baseline.Summary.Operation);
        Assert.Equal("Unknown (tracking baseline)", baseline.Summary.Actor);
        Assert.Equal("unchanged", baseline.Snapshot.Song.Parts[0].Text);
        Assert.Equal(2, (await owner.GetFromJsonAsync<SongResponse>(path))!.Revision);
        using (var stale = await AuthenticationTestHelpers.PutJsonWithAntiforgeryAsync(owner, path,
            new { expectedRevision = 0, title = "Stale", parts = Array.Empty<object>() }))
            Assert.Equal(HttpStatusCode.Conflict, stale.StatusCode);
        using (var legacy = await AuthenticationTestHelpers.PutJsonWithAntiforgeryAsync(owner, path,
            new { title = "Legacy compatible", parts = Array.Empty<object>() }))
            Assert.Equal(HttpStatusCode.NoContent, legacy.StatusCode);
        Assert.Equal(3, (await owner.GetFromJsonAsync<SongResponse>(path))!.Revision);
    }

    [Fact]
    public async Task RestoreRejectsPartCollisionsAndInvalidStoredSchemasWithoutAuditOrPdfChanges()
    {
        using var owner = await User("collision");
        var book = await SongBookTestHelpers.CreateBookAsync(owner, "Collision");
        var song = await SongBookTestHelpers.CreateSongAsync(owner, book.Id, parts: [new { text = "original" }]);
        string path = $"/songbooks/{book.Id}/songs/{song.Id}";
        using var edit = await AuthenticationTestHelpers.PutJsonWithAntiforgeryAsync(owner, path, new { parts = Array.Empty<object>() });
        Assert.Equal(HttpStatusCode.NoContent, edit.StatusCode);
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<SongBookDbContext>();
            var unrelated = new Song { SongBookId = book.Id, Parts = [new Part { Id = song.Parts[0].Id, Text = "unrelated" }] };
            unrelated.Parts[0].SongId = unrelated.Id;
            db.Songs.Add(unrelated);
            await db.SaveChangesAsync();
        }
        long before = await ContentRevision(book.Id);
        using var collision = await AuthenticationTestHelpers.PostJsonWithAntiforgeryAsync(owner, $"{path}/history/1/restore", new { expectedRevision = 2 });
        Assert.Equal(HttpStatusCode.Conflict, collision.StatusCode);
        Assert.Equal(before, await ContentRevision(book.Id));
        Assert.Equal(2, (await owner.GetFromJsonAsync<SongHistory>($"{path}/history"))!.Revisions.Items.Count);
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<SongBookDbContext>();
            var snapshot = await db.SongRevisions.SingleAsync(entry => entry.SongId == song.Id && entry.Revision == 1);
            snapshot.SnapshotJson = "{\"SchemaVersion\":99,\"Song\":{}}";
            await db.SaveChangesAsync();
        }
        using var invalid = await AuthenticationTestHelpers.PostJsonWithAntiforgeryAsync(owner, $"{path}/history/1/restore", new { expectedRevision = 2 });
        Assert.Equal(HttpStatusCode.Conflict, invalid.StatusCode);
        Assert.Equal(before, await ContentRevision(book.Id));
    }

    [Fact]
    public async Task FeedsUseStableNewestFirstLookaheadPagesAndOwnerFilteringBeforePaging()
    {
        using var owner = await User("paging");
        string readerEmail = $"paging-reader-{Guid.NewGuid():N}@example.test";
        using var reader = await AuthenticationTestHelpers.CreateConfirmedClientAsync(factory, readerEmail);
        var book = await SongBookTestHelpers.CreateBookAsync(owner, "Paging");
        await SongBookTestHelpers.SetAccessAsync(owner, book.Id, readerEmail, "reader");
        DateTimeOffset timestamp = DateTimeOffset.UtcNow;
        var ids = Enumerable.Range(1, 55).Select(index => new Guid(index, 0, 0, new byte[8])).ToArray();
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<SongBookDbContext>();
            foreach (Guid id in ids)
                db.BookActivities.Add(new BookActivity { Id = id, SongBookId = book.Id, Operation = "song.updated", OccurredAtUtc = timestamp });
            for (int index = 0; index < 55; index++)
                db.BookActivities.Add(new BookActivity { SongBookId = book.Id, OwnerOnly = true, Operation = "link.revoked", OccurredAtUtc = timestamp.AddSeconds(1) });
            await db.SaveChangesAsync();
        }
        var first = (await reader.GetFromJsonAsync<PageResult<ActivitySummary>>($"/songbooks/{book.Id}/history"))!;
        var second = (await reader.GetFromJsonAsync<PageResult<ActivitySummary>>($"/songbooks/{book.Id}/history?page=2"))!;
        Assert.Equal(50, first.Items.Count);
        Assert.True(first.HasNext);
        Assert.False(second.HasNext);
        Assert.Equal(ids.Reverse(), first.Items.Concat(second.Items).Where(entry => entry.Operation == "song.updated").Select(entry => entry.Id));
        Assert.DoesNotContain(first.Items.Concat(second.Items), entry => entry.Operation == "link.revoked");
        Assert.DoesNotContain("snapshot", (await reader.GetStringAsync($"/songbooks/{book.Id}/history")).ToLowerInvariant());
    }

    [Fact]
    public async Task ReusableActivityWriterStagesInCallerTransactionAndEnforcesSensitivePrivacy()
    {
        using var owner = await User("writer");
        var book = await SongBookTestHelpers.CreateBookAsync(owner, "Writer integration");
        Guid rolledBackId;
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<SongBookDbContext>();
            var mutation = scope.ServiceProvider.GetRequiredService<IMutationContext>();
            mutation.Current = new MutationContext((await db.SongBooks.SingleAsync(candidate => candidate.Id == book.Id)).OwnerId);
            var writer = scope.ServiceProvider.GetRequiredService<IActivityWriter>();
            await using (var transaction = await db.Database.BeginTransactionAsync())
            {
                writer.StageActivity(book.Id, "pdf.generated", description: "With chords");
                rolledBackId = db.ChangeTracker.Entries<BookActivity>().Single(entry => entry.State == EntityState.Added).Entity.Id;
                await db.SaveChangesAsync();
                await transaction.RollbackAsync();
            }
        }
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<SongBookDbContext>();
            Assert.False(await db.BookActivities.AnyAsync(entry => entry.Id == rolledBackId));
            var mutation = scope.ServiceProvider.GetRequiredService<IMutationContext>();
            mutation.Current = new MutationContext((await db.SongBooks.SingleAsync(candidate => candidate.Id == book.Id)).OwnerId);
            var writer = scope.ServiceProvider.GetRequiredService<IActivityWriter>();
            await using var transaction = await db.Database.BeginTransactionAsync();
            writer.StageActivity(book.Id, "pdf.generated");
            writer.StageActivity(book.Id, "link.revoked");
            Assert.Equal(2, db.ChangeTracker.Entries<BookActivity>().Count(entry => entry.State == EntityState.Added));
            await db.SaveChangesAsync();
            await transaction.CommitAsync();
            Assert.True((await db.BookActivities.SingleAsync(entry => entry.SongBookId == book.Id && entry.Operation == "link.revoked")).OwnerOnly);
        }
    }

    [Fact]
    public async Task MigrationUpgradesExistingDataAndMatchesFreshModel()
    {
        await using var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync();
        var options = new DbContextOptionsBuilder<SongBookDbContext>().UseSqlite(connection).Options;
        await using var db = new SongBookDbContext(options);
        var migrator = db.GetService<IMigrator>();
        await migrator.MigrateAsync("20260930205313_StoreSongBookPdfs");
        Guid bookId = Guid.NewGuid(), songId = Guid.NewGuid(), partId = Guid.NewGuid();
        await db.Database.ExecuteSqlInterpolatedAsync($"""
            INSERT INTO AspNetUsers (Id, UserName, EmailConfirmed, PhoneNumberConfirmed, TwoFactorEnabled, LockoutEnabled, AccessFailedCount, IsBanned)
            VALUES ('migration-owner', 'owner', 0, 0, 0, 0, 0, 0);
            INSERT INTO SongBooks (Id, Name, NormalizedName, OwnerId, CreatedAtUtc, UpdatedAtUtc, ContentRevision)
            VALUES ({bookId}, 'Old book', 'OLD BOOK', 'migration-owner', {DateTimeOffset.UtcNow}, {DateTimeOffset.UtcNow}, 5);
            INSERT INTO Songs (Id, SongBookId, Title, CreatedAtUtc, UpdatedAtUtc)
            VALUES ({songId}, {bookId}, 'Old song', {DateTimeOffset.UtcNow}, {DateTimeOffset.UtcNow});
            INSERT INTO Parts (Id, SongId, Position, Text) VALUES ({partId}, {songId}, 0, '😀old');
            INSERT INTO Chords (PartId, Offset, Symbol) VALUES ({partId}, 0, 'C');
            """);
        await migrator.MigrateAsync();
        Assert.False(db.Database.HasPendingModelChanges());
        Assert.Empty(await db.Database.GetPendingMigrationsAsync());
        var old = (await new EfSongRepository(db).GetByIdAsync(bookId, songId))!;
        Assert.Equal(0, old.Revision);
        Assert.Empty(await db.SongRevisions.ToListAsync());
        await new EfSongRepository(db).DeleteAsync(bookId, songId);
        var baseline = await db.SongRevisions.AsNoTracking().SingleAsync(entry => entry.SongId == songId && entry.Revision == 1);
        Assert.Null(baseline.ActorId);
        Assert.Contains("old", baseline.SnapshotJson);
        Assert.Contains(partId.ToString(), baseline.SnapshotJson);
        Assert.Equal(6, (await db.SongBooks.AsNoTracking().SingleAsync(book => book.Id == bookId)).ContentRevision);
        Assert.Equal(2, await db.SongRevisions.CountAsync());
    }

    [Fact]
    public async Task ConcurrentExpectedAndLegacyWritesAllocateUniqueOrderedRevisions()
    {
        string databasePath = Path.GetFullPath($"history-concurrency-{Guid.NewGuid():N}.db");
        var options = new DbContextOptionsBuilder<SongBookDbContext>()
            .UseSqlite($"Data Source={databasePath};Pooling=False;Default Timeout=30").Options;
        Guid bookId = Guid.NewGuid(), songId;
        try
        {
            await using (var db = new SongBookDbContext(options))
            {
                await db.Database.MigrateAsync();
                db.Users.Add(new ApplicationUser { Id = "concurrent-owner", UserName = "Owner" });
                db.SongBooks.Add(new SongBook { Id = bookId, Name = "Concurrent", NormalizedName = "CONCURRENT", OwnerId = "concurrent-owner" });
                await db.SaveChangesAsync();
                songId = (await new EfSongRepository(db).AddAsync(bookId, new Song { Title = "Initial" })).Id;
            }
            async Task<bool> Write(long? expected, int index)
            {
                await using var db = new SongBookDbContext(options);
                var context = new CurrentMutation { Current = new MutationContext("concurrent-owner", expected) };
                try { return await new EfSongRepository(db, context).UpdateAsync(bookId, songId, new Song { Title = $"Write {index}" }); }
                catch (SongRevisionConflictException) { return false; }
            }
            bool[] expectedResults = await Task.WhenAll(Task.Run(() => Write(1, 1)), Task.Run(() => Write(1, 2)));
            Assert.Single(expectedResults, result => result);
            bool[] legacyResults = await Task.WhenAll(Enumerable.Range(3, 6).Select(index => Task.Run(() => Write(null, index))));
            Assert.All(legacyResults, Assert.True);
            await using var fresh = new SongBookDbContext(options);
            Assert.Equal(Enumerable.Range(1, 8).Select(value => (long)value),
                await fresh.SongRevisions.Where(entry => entry.SongId == songId).OrderBy(entry => entry.Revision).Select(entry => entry.Revision).ToArrayAsync());
            Assert.Equal(8, (await fresh.Songs.SingleAsync(song => song.Id == songId)).Revision);
            Assert.Equal(8, (await fresh.SongBooks.SingleAsync(book => book.Id == bookId)).ContentRevision);
        }
        finally
        {
            foreach (string suffix in new[] { "", "-wal", "-shm" })
                if (File.Exists(databasePath + suffix)) File.Delete(databasePath + suffix);
        }
    }

    private Task<HttpClient> User(string prefix)
        => AuthenticationTestHelpers.CreateConfirmedClientAsync(factory, $"{prefix}-{Guid.NewGuid():N}@example.test");

    private async Task<long> ContentRevision(Guid bookId)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        return await scope.ServiceProvider.GetRequiredService<SongBookDbContext>().SongBooks.AsNoTracking()
            .Where(book => book.Id == bookId).Select(book => book.ContentRevision).SingleAsync();
    }
}