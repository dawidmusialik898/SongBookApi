using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SongBookApi.Domain;
using SongBookApi.Domain.Services;
using SongBookApi.Infrastructure.Identity;
using SongBookApi.Service.Contracts;

namespace SongBookApi.Service.Tests;

public sealed class SongCopyTests(TestApplicationFactory factory) : IClassFixture<TestApplicationFactory>
{
    [Theory]
    [InlineData("reader", "editor")]
    [InlineData("editor", "editor")]
    [InlineData("admin", "admin")]
    public async Task DeepCopyHasIndependentIdentityHistoryAndDestinationOnlyPdfChange(string sourceAccess, string destinationAccess)
    {
        using HttpClient owner = await User("owner");
        string email = $"copier-{Guid.NewGuid():N}@example.test";
        using HttpClient copier = await AuthenticationTestHelpers.CreateConfirmedClientAsync(factory, email);
        HttpClient sourceOwner = sourceAccess == "admin" ? copier : owner;
        HttpClient destinationOwner = destinationAccess == "admin" ? copier : owner;
        SongBookResponse source = await SongBookTestHelpers.CreateBookAsync(sourceOwner, $"Private source {Guid.NewGuid()}");
        SongBookResponse destination = await SongBookTestHelpers.CreateBookAsync(destinationOwner, "Destination");
        if (sourceAccess != "admin") await SongBookTestHelpers.SetAccessAsync(owner, source.Id, email, sourceAccess);
        if (destinationAccess != "admin") await SongBookTestHelpers.SetAccessAsync(owner, destination.Id, email, destinationAccess);
        SongResponse original = await SongBookTestHelpers.CreateSongWithFieldsAsync(sourceOwner, source.Id, new
        {
            title = "<Copy me>",
            author = "Author",
            originalTitle = "Original",
            number = "7",
            key = "Am",
            tempo = "120",
            parts = new[]
            {
                new { name = "Verse", text = "😀Żółć\r\nexact  ", chords = new[] { new ChordResponse(0, "C"), new ChordResponse(2, "Am"), new ChordResponse(8, "G/B") } },
                new { name = "Chorus", text = "\nReturn\n", chords = Array.Empty<ChordResponse>() }
            }
        });
        string sourcePath = $"/songbooks/{source.Id}/songs/{original.Id}";
        RevisionDetail originalSnapshot = (await copier.GetFromJsonAsync<RevisionDetail>($"{sourcePath}/history/1"))!;
        string sourceJson = JsonSerializer.Serialize(originalSnapshot);
        long sourceRevision = await ContentRevision(source.Id);
        long destinationRevision = await ContentRevision(destination.Id);
        using HttpResponseMessage response = await Copy(copier, destination.Id, source.Id, original.Id);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        SongResponse copied = (await response.Content.ReadFromJsonAsync<SongResponse>())!;
        string destinationPath = $"/songbooks/{destination.Id}/songs/{copied.Id}";
        Assert.Equal(destinationPath, response.Headers.Location!.OriginalString);
        Assert.NotEqual(original.Id, copied.Id);
        Assert.Equal(1, copied.Revision);
        Assert.Equal(original.Title, copied.Title);
        Assert.Equal(original.Author, copied.Author);
        Assert.Equal(original.OriginalTitle, copied.OriginalTitle);
        Assert.Equal(original.Number, copied.Number);
        Assert.Equal(original.Key, copied.Key);
        Assert.Equal(original.Tempo, copied.Tempo);
        Assert.Equal(original.Parts.Count, copied.Parts.Count);
        for (int index = 0; index < original.Parts.Count; index++)
        {
            Assert.NotEqual(original.Parts[index].Id, copied.Parts[index].Id);
            Assert.Equal(original.Parts[index].Name, copied.Parts[index].Name);
            Assert.Equal(original.Parts[index].Text, copied.Parts[index].Text);
            Assert.Equal(original.Parts[index].Chords, copied.Parts[index].Chords);
        }
        Assert.Equal(sourceRevision, await ContentRevision(source.Id));
        Assert.Equal(destinationRevision + 1, await ContentRevision(destination.Id));
        Assert.Equal(sourceJson, JsonSerializer.Serialize((await copier.GetFromJsonAsync<RevisionDetail>($"{sourcePath}/history/1"))!));
        RevisionDetail snapshot = (await copier.GetFromJsonAsync<RevisionDetail>($"{destinationPath}/history/1"))!;
        Assert.Equal("song.copied", snapshot.Summary.Operation);
        Assert.Equal(email, snapshot.Summary.Actor);
        Assert.Null(snapshot.Summary.RestoredFromRevision);
        Assert.Equal(destination.Id, snapshot.Snapshot.Song.SongBookId);
        Assert.True(snapshot.Snapshot.Song.CreatedAtUtc >= originalSnapshot.Snapshot.Song.CreatedAtUtc);
        Assert.Equal(snapshot.Snapshot.Song.CreatedAtUtc, snapshot.Snapshot.Song.UpdatedAtUtc);
        Assert.All(snapshot.Snapshot.Song.Parts, part =>
        {
            Assert.Equal(copied.Id, part.SongId);
            Assert.All(part.Chords!, chord => Assert.Equal(part.Id, chord.PartId));
        });
        PageResult<ActivitySummary> activity = (await copier.GetFromJsonAsync<PageResult<ActivitySummary>>($"/songbooks/{destination.Id}/history"))!;
        Assert.Single(activity.Items, entry => entry.Operation == "song.copied");
        string historyJson = JsonSerializer.Serialize(new { snapshot, activity });
        Assert.DoesNotContain(source.Id.ToString(), historyJson);
        Assert.DoesNotContain(source.Name!, historyJson);
        Assert.DoesNotContain(original.Id.ToString(), historyJson);
        Assert.Single((await copier.GetFromJsonAsync<SongHistory>($"{destinationPath}/history"))!.Revisions.Items);
        string observerEmail = $"observer-{Guid.NewGuid():N}@example.test";
        using HttpClient observer = await AuthenticationTestHelpers.CreateConfirmedClientAsync(factory, observerEmail);
        await SongBookTestHelpers.SetAccessAsync(destinationOwner, destination.Id, observerEmail, "reader");
        Assert.Equal(HttpStatusCode.NotFound, (await observer.GetAsync(sourcePath)).StatusCode);
        Assert.DoesNotContain(source.Id.ToString(), await observer.GetStringAsync($"{destinationPath}/history/1"));
        Assert.DoesNotContain(source.Name!, await observer.GetStringAsync($"/songbooks/{destination.Id}/history"));

        using (var duplicate = await Copy(copier, destination.Id, source.Id, original.Id))
        {
            Assert.Equal(HttpStatusCode.Created, duplicate.StatusCode);
            SongResponse second = (await duplicate.Content.ReadFromJsonAsync<SongResponse>())!;
            Assert.Equal(copied.Title, second.Title);
            Assert.Equal(copied.Number, second.Number);
            Assert.NotEqual(copied.Id, second.Id);
        }

        using (var update = await AuthenticationTestHelpers.PutJsonWithAntiforgeryAsync(copier, destinationPath,
            new { title = "Independent", parts = Array.Empty<object>(), expectedRevision = 1 }))
            Assert.Equal(HttpStatusCode.NoContent, update.StatusCode);
        Assert.Equal(original.Title, (await copier.GetFromJsonAsync<SongResponse>(sourcePath))!.Title);
        using (var deleteSource = await AuthenticationTestHelpers.DeleteWithAntiforgeryAsync(sourceOwner, sourcePath))
            Assert.Equal(HttpStatusCode.NoContent, deleteSource.StatusCode);
        Assert.Equal("Independent", (await copier.GetFromJsonAsync<SongResponse>(destinationPath))!.Title);
        using (var deleteCopy = await AuthenticationTestHelpers.DeleteWithAntiforgeryAsync(copier, destinationPath))
            Assert.Equal(HttpStatusCode.NoContent, deleteCopy.StatusCode);
    }

    [Fact]
    public async Task CopyPreservesImportedPositionsWithoutCreatingSourceHistory()
    {
        using var owner = await User("import-copy");
        var source = await SongBookTestHelpers.CreateBookAsync(owner, "Imported source");
        var destination = await SongBookTestHelpers.CreateBookAsync(owner, "Imported destination");
        var imported = new SongBookApi.Domain.Dto.Song
        {
            SongBookId = source.Id,
            CreatedAtUtc = DateTimeOffset.UtcNow.AddYears(-1),
            Parts =
            [
                new SongBookApi.Domain.Dto.Part { Position = 9, Name = "Last", Text = "Last", Chords = [] },
                new SongBookApi.Domain.Dto.Part { Position = 4, Name = "First", Text = "First", Chords = [] }
            ]
        };
        foreach (var part in imported.Parts) part.SongId = imported.Id;
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<SongBookDbContext>();
            db.Songs.Add(imported);
            await db.SaveChangesAsync();
        }
        using var response = await Copy(owner, destination.Id, source.Id, imported.Id);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        SongResponse copied = (await response.Content.ReadFromJsonAsync<SongResponse>())!;
        Assert.Equal(new[] { "First", "Last" }, copied.Parts.Select(part => part.Name));
        var snapshot = (await owner.GetFromJsonAsync<RevisionDetail>($"/songbooks/{destination.Id}/songs/{copied.Id}/history/1"))!;
        Assert.Equal(new[] { 4, 9 }, snapshot.Snapshot.Song.Parts.Select(part => part.Position));
        Assert.True(snapshot.Snapshot.Song.CreatedAtUtc > imported.CreatedAtUtc);
        Assert.Empty((await owner.GetFromJsonAsync<SongHistory>($"/songbooks/{source.Id}/songs/{imported.Id}/history"))!.Revisions.Items);

        string path = $"/songbooks/{destination.Id}/songs/{copied.Id}";
        using var edit = await AuthenticationTestHelpers.PutJsonWithAntiforgeryAsync(owner, path,
            new { title = "Changed", parts = Array.Empty<object>(), expectedRevision = 1 });
        Assert.Equal(HttpStatusCode.NoContent, edit.StatusCode);
        using var restore = await AuthenticationTestHelpers.PostJsonWithAntiforgeryAsync(owner,
            $"{path}/history/1/restore", new { expectedRevision = 2 });
        Assert.Equal(HttpStatusCode.OK, restore.StatusCode);
        SongResponse restored = (await owner.GetFromJsonAsync<SongResponse>(path))!;
        Assert.Equal(JsonSerializer.Serialize(copied.Parts), JsonSerializer.Serialize(restored.Parts));
        Assert.Equal(3, restored.Revision);
        using var deleted = await AuthenticationTestHelpers.DeleteWithAntiforgeryAsync(owner,
            $"{path}?expectedRevision=3");
        Assert.Equal(HttpStatusCode.NoContent, deleted.StatusCode);
        using var recovered = await AuthenticationTestHelpers.PostJsonWithAntiforgeryAsync(owner,
            $"{path}/history/1/restore", new { expectedRevision = 4 });
        Assert.Equal(HttpStatusCode.OK, recovered.StatusCode);
        Assert.Equal(JsonSerializer.Serialize(copied.Parts),
            JsonSerializer.Serialize((await owner.GetFromJsonAsync<SongResponse>(path))!.Parts));
    }

    [Fact]
    public async Task CopiedSongRestoreUpdatesSharedBookWhileCustomizedPdfKeepsItsSavedBytes()
    {
        using var owner = await User("combined");
        using var anonymous = factory.CreateSecureClient();
        var source = await SongBookTestHelpers.CreateBookAsync(owner, "Source");
        var destination = await SongBookTestHelpers.CreateBookAsync(owner, "Destination");
        var original = await SongBookTestHelpers.CreateSongAsync(owner, source.Id, "Original",
            [new { text = "Zażółć lyrics", chords = new[] { new ChordResponse(0, "Am") } }]);
        using var copyResponse = await Copy(owner, destination.Id, source.Id, original.Id);
        Assert.Equal(HttpStatusCode.Created, copyResponse.StatusCode);
        var copied = (await copyResponse.Content.ReadFromJsonAsync<SongResponse>())!;
        using var generated = await AuthenticationTestHelpers.PostJsonWithAntiforgeryAsync(owner,
            $"/songbooks/{destination.Id}/pdfs",
            new { includeChords = true, fontFamily = "dejavu-sans-mono", fontSize = 14, orientation = "landscape", columns = 3 });
        Assert.Equal(HttpStatusCode.Created, generated.StatusCode);
        var pdf = (await generated.Content.ReadFromJsonAsync<SongBookPdfInfo>())!;
        byte[] savedBytes = await owner.GetByteArrayAsync($"/songbooks/{destination.Id}/pdfs/{pdf.Id}/download");
        using var enabled = await AuthenticationTestHelpers.PostJsonWithAntiforgeryAsync(owner,
            $"/songbooks/{destination.Id}/share-link", new { });
        Assert.Equal(HttpStatusCode.OK, enabled.StatusCode);
        var link = (await enabled.Content.ReadFromJsonAsync<CreatedShareLink>())!;
        anonymous.DefaultRequestHeaders.Add("X-SongBook-Share-Token", link.Token);
        string privatePath = $"/songbooks/{destination.Id}/songs/{copied.Id}";
        string publicPath = $"/shared/songbooks/{destination.Id}";
        using var edited = await AuthenticationTestHelpers.PutJsonWithAntiforgeryAsync(owner, privatePath,
            new { title = "Changed", parts = Array.Empty<object>(), expectedRevision = 1 });
        Assert.Equal(HttpStatusCode.NoContent, edited.StatusCode);
        Assert.Equal("Changed", (await anonymous.GetFromJsonAsync<SongResponse>($"{publicPath}/songs/{copied.Id}"))!.Title);
        using var restored = await AuthenticationTestHelpers.PostJsonWithAntiforgeryAsync(owner,
            $"{privatePath}/history/1/restore", new { expectedRevision = 2 });
        Assert.Equal(HttpStatusCode.OK, restored.StatusCode);
        var sharedSong = (await anonymous.GetFromJsonAsync<SongResponse>($"{publicPath}/songs/{copied.Id}"))!;
        Assert.Equal(copied.Title, sharedSong.Title);
        Assert.Equal(JsonSerializer.Serialize(copied.Parts), JsonSerializer.Serialize(sharedSong.Parts));
        var sharedPdf = Assert.Single((await anonymous.GetFromJsonAsync<PageResult<SongBookPdfInfo>>($"{publicPath}/pdfs"))!.Items);
        Assert.True(sharedPdf.IsOutdated);
        Assert.Equal(("dejavu-sans-mono", 14, "landscape", 3),
            (sharedPdf.FontFamily, sharedPdf.FontSize, sharedPdf.Orientation, sharedPdf.Columns));
        Assert.Equal(savedBytes, await anonymous.GetByteArrayAsync($"{publicPath}/pdfs/{pdf.Id}/download"));
        Assert.Equal(3, await ContentRevision(destination.Id));
        Assert.Equal(1, await ContentRevision(source.Id));
        Assert.Equal(HttpStatusCode.NotFound, (await anonymous.GetAsync($"{publicPath}/history")).StatusCode);
        using var revoked = await AuthenticationTestHelpers.DeleteWithAntiforgeryAsync(owner,
            $"/songbooks/{destination.Id}/share-link");
        Assert.Equal(HttpStatusCode.NoContent, revoked.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await anonymous.GetAsync($"{publicPath}/pdfs/{pdf.Id}/download")).StatusCode);
    }

    [Fact]
    public async Task EmptyPartsCopyStalesOnlyDestinationPdfAndCreationJoinsCallerTransaction()
    {
        using var owner = await User("pdf-copy");
        var source = await SongBookTestHelpers.CreateBookAsync(owner, "Source PDF");
        var destination = await SongBookTestHelpers.CreateBookAsync(owner, "Destination PDF");
        var song = await SongBookTestHelpers.CreateSongWithFieldsAsync(owner, source.Id, new { parts = Array.Empty<object>() });
        foreach (Guid bookId in new[] { source.Id, destination.Id })
        {
            using var generated = await AuthenticationTestHelpers.PostJsonWithAntiforgeryAsync(owner,
                $"/songbooks/{bookId}/pdfs", new { includeChords = false });
            Assert.Equal(HttpStatusCode.Created, generated.StatusCode);
        }
        using var response = await Copy(owner, destination.Id, source.Id, song.Id);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        SongResponse copied = (await response.Content.ReadFromJsonAsync<SongResponse>())!;
        Assert.Empty(copied.Parts);
        Assert.Null(copied.Title);
        Assert.False((await owner.GetFromJsonAsync<PageResult<SongBookPdfInfo>>($"/songbooks/{source.Id}/pdfs"))!.Items[0].IsOutdated);
        Assert.True((await owner.GetFromJsonAsync<PageResult<SongBookPdfInfo>>($"/songbooks/{destination.Id}/pdfs"))!.Items[0].IsOutdated);
        long before = await ContentRevision(destination.Id);
        Guid rolledBackId;
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<SongBookDbContext>();
            scope.ServiceProvider.GetRequiredService<IMutationContext>().Current =
                new MutationContext(Operation: "song.copied");
            await using var transaction = await db.Database.BeginTransactionAsync();
            var staged = await scope.ServiceProvider.GetRequiredService<ISongService>().CreateSongAsync(destination.Id,
                new SongBookApi.Domain.Dto.Song { Title = "Rolled back" });
            rolledBackId = staged.Id;
            await transaction.RollbackAsync();
        }
        await using var finalScope = factory.Services.CreateAsyncScope();
        var finalDb = finalScope.ServiceProvider.GetRequiredService<SongBookDbContext>();
        Assert.False(await finalDb.Songs.AnyAsync(entry => entry.Id == rolledBackId));
        Assert.False(await finalDb.SongRevisions.AnyAsync(entry => entry.SongId == rolledBackId));
        Assert.False(await finalDb.BookActivities.AnyAsync(entry => entry.SongId == rolledBackId));
        Assert.Equal(before, await ContentRevision(destination.Id));
    }

    [Fact]
    public async Task AuthorizationValidationAntiforgeryAndRevocationNeverWrite()
    {
        using var owner = await User("owner");
        string email = $"reader-{Guid.NewGuid():N}@example.test";
        using var reader = await AuthenticationTestHelpers.CreateConfirmedClientAsync(factory, email);
        using var outsider = await User("outsider");
        using var anonymous = factory.CreateSecureClient();
        var source = await SongBookTestHelpers.CreateBookAsync(owner, "Source");
        var destination = await SongBookTestHelpers.CreateBookAsync(owner, "Destination");
        var sourceMembership = await SongBookTestHelpers.SetAccessAsync(owner, source.Id, email, "reader");
        await SongBookTestHelpers.SetAccessAsync(owner, destination.Id, email, "reader");
        var song = await SongBookTestHelpers.CreateSongAsync(owner, source.Id);
        long before = await ContentRevision(destination.Id);
        using (var denied = await Copy(reader, destination.Id, source.Id, song.Id))
            Assert.Equal(HttpStatusCode.Forbidden, denied.StatusCode);
        using (var denied = await Copy(outsider, destination.Id, source.Id, song.Id))
            Assert.Equal(HttpStatusCode.NotFound, denied.StatusCode);
        using (var denied = await anonymous.PostAsJsonAsync($"/songbooks/{destination.Id}/songs/copy", new { sourceBookId = source.Id, sourceSongId = song.Id }))
            Assert.Equal(HttpStatusCode.Unauthorized, denied.StatusCode);
        using (var missingCsrf = await owner.PostAsJsonAsync($"/songbooks/{destination.Id}/songs/copy", new { sourceBookId = source.Id, sourceSongId = song.Id }))
            Assert.Equal(HttpStatusCode.BadRequest, missingCsrf.StatusCode);
        foreach (var ids in new[]
        {
            (destination.Id, source.Id, Guid.NewGuid(), HttpStatusCode.NotFound),
            (destination.Id, Guid.NewGuid(), song.Id, HttpStatusCode.NotFound),
            (Guid.NewGuid(), source.Id, song.Id, HttpStatusCode.NotFound),
            (source.Id, source.Id, song.Id, HttpStatusCode.BadRequest),
            (destination.Id, Guid.Empty, song.Id, HttpStatusCode.BadRequest),
            (destination.Id, source.Id, Guid.Empty, HttpStatusCode.BadRequest)
        })
        {
            using var response = await Copy(owner, ids.Item1, ids.Item2, ids.Item3);
            Assert.Equal(ids.Item4, response.StatusCode);
        }
        var wrongBookSong = await SongBookTestHelpers.CreateSongAsync(owner, destination.Id);
        before++;
        using (var wrongBook = await Copy(owner, destination.Id, source.Id, wrongBookSong.Id))
            Assert.Equal(HttpStatusCode.NotFound, wrongBook.StatusCode);
        await SongBookTestHelpers.SetAccessAsync(owner, destination.Id, email, "editor");
        using (var removed = await AuthenticationTestHelpers.DeleteWithAntiforgeryAsync(owner, $"/songbooks/{source.Id}/access/{sourceMembership.Id}"))
            Assert.Equal(HttpStatusCode.NoContent, removed.StatusCode);
        using (var revoked = await Copy(reader, destination.Id, source.Id, song.Id))
            Assert.Equal(HttpStatusCode.NotFound, revoked.StatusCode);
        await SongBookTestHelpers.SetAccessAsync(owner, source.Id, email, "reader");
        await SongBookTestHelpers.SetAccessAsync(owner, destination.Id, email, "reader");
        using (var revoked = await Copy(reader, destination.Id, source.Id, song.Id))
            Assert.Equal(HttpStatusCode.Forbidden, revoked.StatusCode);
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<SongBookDbContext>();
            var account = await db.Users.SingleAsync(user => user.Email == email);
            account.IsBanned = true;
            await db.SaveChangesAsync();
        }
        using (var banned = await Copy(reader, destination.Id, source.Id, song.Id))
            Assert.Equal(HttpStatusCode.Unauthorized, banned.StatusCode);
        Assert.Equal(before, await ContentRevision(destination.Id));
        await using var finalScope = factory.Services.CreateAsyncScope();
        var finalDb = finalScope.ServiceProvider.GetRequiredService<SongBookDbContext>();
        Assert.False(await finalDb.BookActivities.AnyAsync(entry => entry.SongBookId == destination.Id && entry.Operation == "song.copied"));
    }

    private Task<HttpClient> User(string label) => AuthenticationTestHelpers.CreateConfirmedClientAsync(factory, $"{label}-{Guid.NewGuid():N}@example.test");
    private static Task<HttpResponseMessage> Copy(HttpClient client, Guid destination, Guid source, Guid song) =>
        AuthenticationTestHelpers.PostJsonWithAntiforgeryAsync(client, $"/songbooks/{destination}/songs/copy",
            new { sourceBookId = source, sourceSongId = song, actorId = "untrusted" });

    private async Task<long> ContentRevision(Guid bookId)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        return await scope.ServiceProvider.GetRequiredService<SongBookDbContext>().SongBooks
            .Where(book => book.Id == bookId).Select(book => book.ContentRevision).SingleAsync();
    }
}