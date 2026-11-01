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
using System.Net;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace SongBookApi.Service.Tests;

public sealed class ShareLinkTests : IClassFixture<TestApplicationFactory>
{
    private readonly TestApplicationFactory factory;
    public ShareLinkTests(TestApplicationFactory factory) => this.factory = factory;

    [Fact]
    public async Task OwnerOnlyManagementAntiforgeryAndPrivateAtomicHistory()
    {
        using HttpClient owner = await User("owner");
        using HttpClient outsider = await User("outsider");
        using HttpClient anonymous = factory.CreateSecureClient();
        string readerEmail = $"reader-{Guid.NewGuid():N}@example.test";
        string editorEmail = $"editor-{Guid.NewGuid():N}@example.test";
        using HttpClient reader = await AuthenticationTestHelpers.CreateConfirmedClientAsync(factory, readerEmail);
        using HttpClient editor = await AuthenticationTestHelpers.CreateConfirmedClientAsync(factory, editorEmail);
        SongBookResponse book = await SongBookTestHelpers.CreateBookAsync(owner, "Links");
        await SongBookTestHelpers.SetAccessAsync(owner, book.Id, readerEmail, "reader");
        await SongBookTestHelpers.SetAccessAsync(owner, book.Id, editorEmail, "editor");
        string path = $"/songbooks/{book.Id}/share-link";
        Assert.False((await owner.GetFromJsonAsync<ShareLinkMetadata>(path))!.Enabled);
        foreach ((HttpClient? client, HttpStatusCode status) in new[]
        {
            (reader, HttpStatusCode.Forbidden), (editor, HttpStatusCode.Forbidden),
            (outsider, HttpStatusCode.NotFound), (anonymous, HttpStatusCode.Unauthorized)
        })
        {
            Assert.Equal(status, (await client.GetAsync(path)).StatusCode);
            using HttpResponseMessage post = await AuthenticationTestHelpers.PostJsonWithAntiforgeryAsync(client, path, new { });
            Assert.Equal(status, post.StatusCode);
            using HttpResponseMessage delete = await AuthenticationTestHelpers.DeleteWithAntiforgeryAsync(client, path);
            Assert.Equal(status, delete.StatusCode);
        }
        Assert.Equal(HttpStatusCode.BadRequest, (await owner.PostAsync(path, null)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await owner.DeleteAsync(path)).StatusCode);
        CreatedShareLink first = await Enable(owner, book.Id);
        Assert.Matches("^[A-Za-z0-9_-]{43}$", first.Token);
        Assert.Equal(32, Convert.FromBase64String(first.Token.Replace('-', '+').Replace('_', '/') + "=").Length);
        using HttpResponseMessage metadata = await owner.GetAsync(path);
        Assert.True(metadata.Headers.CacheControl!.NoStore);
        Assert.DoesNotContain(first.Token, await metadata.Content.ReadAsStringAsync());
        Assert.True((await metadata.Content.ReadFromJsonAsync<ShareLinkMetadata>())!.Enabled);
        CreatedShareLink second = await Enable(owner, book.Id);
        Assert.NotEqual(first.Token, second.Token);
        using (IServiceScope scope = factory.Services.CreateScope())
        {
            SongBookDbContext db = scope.ServiceProvider.GetRequiredService<SongBookDbContext>();
            SongBookShareLink link = await db.SongBookShareLinks.SingleAsync(link => link.SongBookId == book.Id);
            Assert.Equal(Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(second.Token))), link.TokenHash);
            Assert.NotEqual(second.Token, link.TokenHash);
            Assert.NotNull(link.ActorId);
            Assert.Equal(2, await db.SongBookAccessEntries.CountAsync(entry => entry.SongBookId == book.Id));
            Assert.DoesNotContain(first.Token, JsonSerializer.Serialize(await db.BookActivities.Where(entry => entry.SongBookId == book.Id).ToListAsync()));
            Assert.DoesNotContain(second.Token, JsonSerializer.Serialize(await db.BookActivities.Where(entry => entry.SongBookId == book.Id).ToListAsync()));
        }
        Assert.Equal(HttpStatusCode.NotFound, (await Read(anonymous, book.Id, first.Token)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await Read(anonymous, book.Id, second.Token)).StatusCode);
        using HttpResponseMessage revoke = await AuthenticationTestHelpers.DeleteWithAntiforgeryAsync(owner, path);
        Assert.Equal(HttpStatusCode.NoContent, revoke.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await Read(anonymous, book.Id, second.Token)).StatusCode);
        Assert.False((await owner.GetFromJsonAsync<ShareLinkMetadata>(path))!.Enabled);
        PageResult<ActivitySummary> ownerHistory = (await owner.GetFromJsonAsync<PageResult<ActivitySummary>>($"/songbooks/{book.Id}/history"))!;
        Assert.Equal(new[] { "link.revoked", "link.replaced", "link.created" },
            ownerHistory.Items.Where(entry => entry.Operation.StartsWith("link.")).Select(entry => entry.Operation));
        PageResult<ActivitySummary> readerHistory = (await reader.GetFromJsonAsync<PageResult<ActivitySummary>>($"/songbooks/{book.Id}/history"))!;
        Assert.DoesNotContain(readerHistory.Items, entry => entry.Operation.StartsWith("link."));
    }

    [Fact]
    public async Task PublicReadCapabilityIsBookBoundAndNeverGrantsPrivateOrMutationAccess()
    {
        using HttpClient owner = await User("owner");
        using HttpClient anonymous = factory.CreateSecureClient();
        SongBookResponse book = await SongBookTestHelpers.CreateBookAsync(owner, "Public");
        SongBookResponse other = await SongBookTestHelpers.CreateBookAsync(owner, "Other");
        SongResponse song = await SongBookTestHelpers.CreateSongAsync(owner, book.Id, "A first",
            [new { name = "<Verse>", text = "😀lyrics", chords = new[] { new { offset = 0, symbol = "C" } } }]);
        SongResponse next = await SongBookTestHelpers.CreateSongAsync(owner, book.Id, "B next");
        SongResponse foreign = await SongBookTestHelpers.CreateSongAsync(owner, other.Id, "Foreign");
        CreatedShareLink link = await Enable(owner, book.Id);
        foreach (string? token in new[] { null, "", "invalid", new string('A', 43), link.Token + "x" })
        {
            using HttpResponseMessage denied = await Read(anonymous, book.Id, token);
            Assert.Equal(HttpStatusCode.NotFound, denied.StatusCode);
            Assert.True(denied.Headers.CacheControl!.NoStore);
            Assert.Equal("no-referrer", denied.Headers.GetValues("Referrer-Policy").Single());
        }
        Assert.Equal(HttpStatusCode.NotFound, (await Read(owner, book.Id, null)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await Read(anonymous, other.Id, link.Token)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await Read(anonymous, Guid.NewGuid(), link.Token)).StatusCode);
        using HttpResponseMessage details = await Read(anonymous, book.Id, link.Token);
        string json = await details.Content.ReadAsStringAsync();
        Assert.Equal(HttpStatusCode.OK, details.StatusCode);
        Assert.DoesNotContain("owner", json, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("accessLevel", json);
        using HttpResponseMessage songs = await Read(anonymous, book.Id, link.Token, "/songs?search=next&page=1");
        PageResult<SongSummaryResponse> page = (await songs.Content.ReadFromJsonAsync<PageResult<SongSummaryResponse>>())!;
        Assert.Equal(next.Id, Assert.Single(page.Items).Id);
        using HttpResponseMessage detail = await Read(anonymous, book.Id, link.Token, $"/songs/{song.Id}");
        string songJson = await detail.Content.ReadAsStringAsync();
        Assert.DoesNotContain("revision", songJson);
        Assert.DoesNotContain("actor", songJson);
        SongResponse returned = (await detail.Content.ReadFromJsonAsync<SongResponse>())!;
        Assert.Equal("😀lyrics", returned.Parts[0].Text);
        Assert.Equal("C", returned.Parts[0].Chords[0].Symbol);
        using HttpResponseMessage adjacent = await Read(anonymous, book.Id, link.Token, $"/songs/{song.Id}/adjacent");
        Assert.Equal(next.Id, (await adjacent.Content.ReadFromJsonAsync<AdjacentSongsResponse>())!.Next!.Id);
        Assert.Equal(HttpStatusCode.NotFound, (await Read(anonymous, book.Id, link.Token, $"/songs/{foreign.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await Read(anonymous, book.Id, link.Token, $"/songs/{foreign.Id}/adjacent")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await Read(anonymous, book.Id, link.Token, "/songs?page=0")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await Read(anonymous, book.Id, link.Token, "/songs?page=invalid")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await Read(anonymous, book.Id, link.Token, "/pdfs?page=invalid")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await Read(anonymous, book.Id, null, "/songs?page=invalid")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await Read(anonymous, book.Id, null, "/pdfs?page=invalid")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await Read(anonymous, book.Id, link.Token, "/songs?search=" + new string('a', 101))).StatusCode);
        foreach (string tail in new[] { "/history", "/access", "/share-link", $"/songs/{song.Id}/history", $"/songs/{song.Id}/history/1" })
            Assert.Equal(HttpStatusCode.NotFound, (await Read(anonymous, book.Id, link.Token, tail)).StatusCode);
        foreach (string tail in new[] { "", "/songs", "/songs/copy", $"/songs/{song.Id}", "/pdfs", $"/songs/{song.Id}/history/1/restore" })
        {
            foreach (HttpMethod? method in new[] { HttpMethod.Post, HttpMethod.Put, HttpMethod.Delete })
            {
                using var request = new HttpRequestMessage(method, $"/shared/songbooks/{book.Id}{tail}");
                request.Headers.Add("X-SongBook-Share-Token", link.Token);
                using HttpResponseMessage denied = await anonymous.SendAsync(request);
                Assert.Contains(denied.StatusCode, new[] { HttpStatusCode.NotFound, HttpStatusCode.MethodNotAllowed });
            }
        }
        anonymous.DefaultRequestHeaders.Add("X-SongBook-Share-Token", link.Token);
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync($"/songbooks/{book.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.PostAsJsonAsync($"/songbooks/{book.Id}/songs", new { title = "No" })).StatusCode);
        await Enable(owner, other.Id);
        using HttpResponseMessage delete = await AuthenticationTestHelpers.DeleteWithAntiforgeryAsync(owner, $"/songbooks/{book.Id}");
        Assert.Equal(HttpStatusCode.NoContent, delete.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await Read(owner, book.Id, link.Token)).StatusCode);
        using IServiceScope scope = factory.Services.CreateScope();
        Assert.False(await scope.ServiceProvider.GetRequiredService<SongBookDbContext>().SongBookShareLinks.AnyAsync(entry => entry.SongBookId == book.Id));
    }

    [Fact]
    public async Task PublicPagingUsesSqlOrderAndDownloadsSavedCustomizedPdf()
    {
        using HttpClient owner = await User("owner");
        using HttpClient anonymous = factory.CreateSecureClient();
        SongBookResponse book = await SongBookTestHelpers.CreateBookAsync(owner, "PDF public");
        SongBookResponse other = await SongBookTestHelpers.CreateBookAsync(owner, "PDF other");
        await SongBookTestHelpers.CreateSongAsync(owner, book.Id, "Song", [new { name = "Verse", text = "Saved lyrics", chords = Array.Empty<object>() }]);
        using HttpResponseMessage generated = await AuthenticationTestHelpers.PostJsonWithAntiforgeryAsync(owner, $"/songbooks/{book.Id}/pdfs",
            new { includeChords = true, fontFamily = "dejavu-sans-mono", fontSize = 14, orientation = "landscape", columns = 3 });
        Assert.Equal(HttpStatusCode.Created, generated.StatusCode);
        SongBookPdfInfo pdf = (await generated.Content.ReadFromJsonAsync<SongBookPdfInfo>())!;
        using (IServiceScope scope = factory.Services.CreateScope())
        {
            SongBookDbContext db = scope.ServiceProvider.GetRequiredService<SongBookDbContext>();
            db.Songs.AddRange(Enumerable.Range(0, 50).Select(index =>
                new Domain.Dto.Song { Id = Guid.NewGuid(), SongBookId = book.Id, Title = $"A{index:00}" }));
            await db.SaveChangesAsync();
        }
        CreatedShareLink link = await Enable(owner, book.Id);
        using HttpResponseMessage first = await Read(anonymous, book.Id, link.Token, "/songs");
        PageResult<SongSummaryResponse> firstPage = (await first.Content.ReadFromJsonAsync<PageResult<SongSummaryResponse>>())!;
        Assert.True(firstPage.HasNext);
        Assert.Equal(50, firstPage.Items.Count);
        Assert.Equal("A00", firstPage.Items[0].Title);
        using HttpResponseMessage second = await Read(anonymous, book.Id, link.Token, "/songs?page=2");
        Assert.Equal("Song", Assert.Single((await second.Content.ReadFromJsonAsync<PageResult<SongSummaryResponse>>())!.Items).Title);
        using HttpResponseMessage list = await Read(anonymous, book.Id, link.Token, "/pdfs");
        SongBookPdfInfo metadata = Assert.Single((await list.Content.ReadFromJsonAsync<PageResult<SongBookPdfInfo>>())!.Items);
        Assert.Equal(pdf.FontFamily, metadata.FontFamily);
        Assert.Equal(14, metadata.FontSize);
        Assert.Equal("landscape", metadata.Orientation);
        Assert.Equal(3, metadata.Columns);
        using HttpResponseMessage download = await Read(anonymous, book.Id, link.Token, $"/pdfs/{pdf.Id}/download");
        using HttpResponseMessage privateDownload = await owner.GetAsync($"/songbooks/{book.Id}/pdfs/{pdf.Id}/download");
        Assert.Equal(await privateDownload.Content.ReadAsByteArrayAsync(), await download.Content.ReadAsByteArrayAsync());
        Assert.Equal("application/pdf", download.Content.Headers.ContentType!.MediaType);
        Assert.True(download.Headers.CacheControl!.NoStore);
        Assert.Equal(HttpStatusCode.NotFound, (await Read(anonymous, book.Id, link.Token, $"/pdfs/{Guid.NewGuid()}/download")).StatusCode);
        CreatedShareLink otherLink = await Enable(owner, other.Id);
        Assert.Equal(HttpStatusCode.NotFound, (await Read(anonymous, other.Id, otherLink.Token, $"/pdfs/{pdf.Id}/download")).StatusCode);
        using HttpResponseMessage revoke = await AuthenticationTestHelpers.DeleteWithAntiforgeryAsync(owner, $"/songbooks/{book.Id}/share-link");
        Assert.Equal(HttpStatusCode.NotFound, (await Read(anonymous, book.Id, link.Token, $"/pdfs/{pdf.Id}/download")).StatusCode);
    }

    [Fact]
    public async Task PublicLimiterCountsMissingTokensAcrossBooksWithoutQueue()
    {
        using var limitedFactory = new TestApplicationFactory(useFixedRemoteIp: true);
        using HttpClient client = limitedFactory.CreateSecureClient();
        for (int index = 0; index < 60; index++)
            Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/shared/songbooks/{Guid.NewGuid()}")).StatusCode);
        using HttpResponseMessage limited = await client.GetAsync($"/shared/songbooks/{Guid.NewGuid()}");
        Assert.Equal(HttpStatusCode.TooManyRequests, limited.StatusCode);
        Assert.True(limited.Headers.CacheControl!.NoStore);
        Assert.Equal("no-referrer", limited.Headers.GetValues("Referrer-Policy").Single());
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/auth/me")).StatusCode);
    }

    [Fact]
    public async Task MigrationUpgradesExistingBooksDisabledAndConstrainsHashesAndCascade()
    {
        await using var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync();
        await using var db = new SongBookDbContext(new DbContextOptionsBuilder<SongBookDbContext>().UseSqlite(connection).Options);
        IMigrator migrator = db.GetService<IMigrator>();
        await migrator.MigrateAsync("20261101055318_AddPdfCustomization");
        Guid bookId = Guid.NewGuid(), otherId = Guid.NewGuid();
        await db.Database.ExecuteSqlInterpolatedAsync($"""
            INSERT INTO AspNetUsers (Id, UserName, NormalizedUserName, EmailConfirmed, PhoneNumberConfirmed, TwoFactorEnabled, LockoutEnabled, AccessFailedCount, IsBanned)
            VALUES ('link-owner', 'Owner', 'OWNER', 1, 0, 0, 0, 0, 0);
            INSERT INTO SongBooks (Id, Name, NormalizedName, OwnerId, ContentRevision, CreatedAtUtc, UpdatedAtUtc) VALUES ({bookId}, 'Old', 'OLD', 'link-owner', 7, '2020-01-01', '2020-01-01');
            INSERT INTO SongBooks (Id, Name, NormalizedName, OwnerId, ContentRevision, CreatedAtUtc, UpdatedAtUtc) VALUES ({otherId}, 'Other', 'OTHER', 'link-owner', 0, '2020-01-01', '2020-01-01');
            """);
        await migrator.MigrateAsync();
        Assert.False(db.Database.HasPendingModelChanges());
        Assert.Empty(await db.SongBookShareLinks.ToListAsync());
        Assert.Equal(7, (await db.SongBooks.SingleAsync(book => book.Id == bookId)).ContentRevision);
        db.SongBookShareLinks.Add(new SongBookShareLink { SongBookId = bookId, TokenHash = new string('A', 64), ActorId = "link-owner" });
        await db.SaveChangesAsync();
        db.SongBookShareLinks.Add(new SongBookShareLink { SongBookId = otherId, TokenHash = new string('A', 64) });
        await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync());
        db.ChangeTracker.Clear();
        await db.Database.ExecuteSqlInterpolatedAsync($"DELETE FROM SongBooks WHERE Id = {bookId}");
        Assert.Empty(await db.SongBookShareLinks.ToListAsync());
    }

    [Fact]
    public async Task FailedActivitySaveRollsBackRotationAndRevocation()
    {
        using HttpClient owner = await User("rollback");
        SongBookResponse book = await SongBookTestHelpers.CreateBookAsync(owner, "Rollback links");
        CreatedShareLink link = await Enable(owner, book.Id);
        foreach (bool revoke in new[] { false, true })
        {
            using IServiceScope scope = factory.Services.CreateScope();
            SongBookDbContext db = scope.ServiceProvider.GetRequiredService<SongBookDbContext>();
            var context = new CurrentMutation { Current = new MutationContext("nonexistent-actor") };
            var service = new EfShareLinkService(db, context, new EfActivityWriter(db, context));
            if (revoke)
                await Assert.ThrowsAsync<DbUpdateException>(() => service.RevokeAsync(book.Id));
            else
                await Assert.ThrowsAsync<DbUpdateException>(() => service.ReplaceAsync(book.Id));
        }
        using IServiceScope fresh = factory.Services.CreateScope();
        Assert.True(await fresh.ServiceProvider.GetRequiredService<IShareLinkService>().ValidateAsync(book.Id, link.Token));
        Assert.Single(await fresh.ServiceProvider.GetRequiredService<SongBookDbContext>().BookActivities
            .Where(entry => entry.SongBookId == book.Id && entry.Operation.StartsWith("link.")).ToListAsync());
    }

    private Task<HttpClient> User(string prefix) => AuthenticationTestHelpers.CreateConfirmedClientAsync(
        factory, $"{prefix}-{Guid.NewGuid():N}@example.test");

    private static async Task<CreatedShareLink> Enable(HttpClient owner, Guid bookId)
    {
        using HttpResponseMessage response = await AuthenticationTestHelpers.PostJsonWithAntiforgeryAsync(owner, $"/songbooks/{bookId}/share-link", new { });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.True(response.Headers.CacheControl!.NoStore);
        return (await response.Content.ReadFromJsonAsync<CreatedShareLink>())!;
    }

    private static Task<HttpResponseMessage> Read(HttpClient client, Guid bookId, string? token, string tail = "")
    {
        var request = new HttpRequestMessage(HttpMethod.Get, $"/shared/songbooks/{bookId}{tail}");
        if (token is not null) request.Headers.Add("X-SongBook-Share-Token", token);
        return client.SendAsync(request);
    }
}