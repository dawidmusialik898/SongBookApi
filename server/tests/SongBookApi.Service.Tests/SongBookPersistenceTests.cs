using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using System.Net.Http.Json;
using SongBookApi.Domain.Dto;
using SongBookApi.Domain.Entities;
using SongBookApi.Infrastructure.Identity;
using SongBookApi.Service.Contracts;

namespace SongBookApi.Service.Tests;

[Trait("Category", "Integration")]
public sealed class SongBookPersistenceTests : IClassFixture<TestApplicationFactory>
{
    private readonly TestApplicationFactory _factory;

    public SongBookPersistenceTests(TestApplicationFactory factory) => _factory = factory;

    [Fact]
    public async Task DataAndPartOrderSurviveFreshDbContextAndBookDeletionCascades()
    {
        string memberEmail = $"cascade-member-{Guid.NewGuid():N}@example.test";
        using HttpClient owner = await CreateUserAsync("cascade-owner");
        using HttpClient member =
            await AuthenticationTestHelpers.CreateConfirmedClientAsync(_factory, memberEmail);
        SongBookResponse book = await SongBookTestHelpers.CreateBookAsync(owner, "Persistent");
        SongBookAccessResponse access =
            await SongBookTestHelpers.SetAccessAsync(owner, book.Id, memberEmail, "reader");
        SongResponse song = await SongBookTestHelpers.CreateSongAsync(
            owner,
            book.Id,
            parts:
            [
                new { name = "First", text = "1" },
                new { name = "Second", text = "2" }
            ]);

        await using (AsyncServiceScope firstScope = _factory.Services.CreateAsyncScope())
        {
            SongBookDbContext db = firstScope.ServiceProvider.GetRequiredService<SongBookDbContext>();
            Assert.True(await db.SongBooks.AnyAsync(candidate => candidate.Id == book.Id));
        }
        await using (AsyncServiceScope freshScope = _factory.Services.CreateAsyncScope())
        {
            SongBookDbContext db = freshScope.ServiceProvider.GetRequiredService<SongBookDbContext>();
            Song persisted = await db.Songs.AsNoTracking()
                .Include(candidate => candidate.Parts.OrderBy(part => part.Position))
                .SingleAsync(candidate => candidate.Id == song.Id);
            Assert.Equal(new[] { 0, 1 }, persisted.Parts.Select(part => part.Position));
            Assert.Equal(new[] { "First", "Second" }, persisted.Parts.Select(part => part.Name));
        }

        Assert.Equal(
            System.Net.HttpStatusCode.NoContent,
            (await AuthenticationTestHelpers.DeleteWithAntiforgeryAsync(
                owner, $"/songbooks/{book.Id}")).StatusCode);

        await using AsyncServiceScope deletedScope = _factory.Services.CreateAsyncScope();
        SongBookDbContext deletedDb =
            deletedScope.ServiceProvider.GetRequiredService<SongBookDbContext>();
        Assert.False(await deletedDb.SongBooks.AnyAsync(candidate => candidate.Id == book.Id));
        Assert.False(await deletedDb.Songs.AnyAsync(candidate => candidate.Id == song.Id));
        Assert.False(await deletedDb.Parts.AnyAsync(part => part.SongId == song.Id));
        Assert.False(await deletedDb.SongBookAccessEntries.AnyAsync(entry => entry.Id == access.Id));
    }

    [Fact]
    public async Task DatabaseUniqueConstraintsProtectNameAndAccessRaces()
    {
        string ownerEmail = $"constraint-owner-{Guid.NewGuid():N}@example.test";
        string memberEmail = $"constraint-member-{Guid.NewGuid():N}@example.test";
        using HttpClient owner =
            await AuthenticationTestHelpers.CreateConfirmedClientAsync(_factory, ownerEmail);
        using HttpClient member =
            await AuthenticationTestHelpers.CreateConfirmedClientAsync(_factory, memberEmail);

        await using AsyncServiceScope scope = _factory.Services.CreateAsyncScope();
        SongBookDbContext db = scope.ServiceProvider.GetRequiredService<SongBookDbContext>();
        UserManager<ApplicationUser> users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        ApplicationUser ownerUser = (await users.FindByEmailAsync(ownerEmail))!;
        ApplicationUser memberUser = (await users.FindByEmailAsync(memberEmail))!;
        DateTimeOffset now = DateTimeOffset.UtcNow;
        Guid firstBookId = Guid.NewGuid();
        db.SongBooks.Add(new SongBook
        {
            Id = firstBookId,
            Name = "Unique",
            NormalizedName = "UNIQUE",
            OwnerId = ownerUser.Id,
            CreatedAtUtc = now,
            UpdatedAtUtc = now
        });
        await db.SaveChangesAsync();

        db.SongBooks.Add(new SongBook
        {
            Id = Guid.NewGuid(),
            Name = "Unique duplicate",
            NormalizedName = "UNIQUE",
            OwnerId = ownerUser.Id,
            CreatedAtUtc = now,
            UpdatedAtUtc = now
        });
        await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync());
        db.ChangeTracker.Clear();

        db.SongBookAccessEntries.AddRange(
            new SongBookAccess
            {
                Id = Guid.NewGuid(),
                SongBookId = firstBookId,
                UserId = memberUser.Id,
                AccessLevel = SongBookAccessLevel.Reader,
                CreatedAtUtc = now,
                UpdatedAtUtc = now
            },
            new SongBookAccess
            {
                Id = Guid.NewGuid(),
                SongBookId = firstBookId,
                UserId = memberUser.Id,
                AccessLevel = SongBookAccessLevel.Editor,
                CreatedAtUtc = now,
                UpdatedAtUtc = now
            });
        await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync());
    }

    [Fact]
    public async Task FileBackedDatabaseSurvivesApplicationFactoryRestart()
    {
        string databasePath = Path.Combine(
            AppContext.BaseDirectory,
            $"restart-{Guid.NewGuid():N}.db");
        string ownerEmail = $"restart-owner-{Guid.NewGuid():N}@example.test";
        string readerEmail = $"restart-reader-{Guid.NewGuid():N}@example.test";
        Guid bookId;
        Guid songId;

        try
        {
            using (TestApplicationFactory firstFactory = new(databasePath))
            {
                using HttpClient owner =
                    await AuthenticationTestHelpers.CreateConfirmedClientAsync(firstFactory, ownerEmail);
                using HttpClient reader =
                    await AuthenticationTestHelpers.CreateConfirmedClientAsync(firstFactory, readerEmail);
                SongBookResponse book = await SongBookTestHelpers.CreateBookAsync(owner, "Restart");
                SongResponse song = await SongBookTestHelpers.CreateSongAsync(
                    owner,
                    book.Id,
                    parts: [new { name = "Persisted part", text = "Persisted text" }]);
                _ = await SongBookTestHelpers.SetAccessAsync(owner, book.Id, readerEmail, "reader");
                bookId = book.Id;
                songId = song.Id;
            }

            using (TestApplicationFactory restartedFactory = new(databasePath))
            {
                using HttpClient owner = restartedFactory.CreateSecureClient();
                using HttpResponseMessage login =
                    await AuthenticationTestHelpers.PostJsonWithAntiforgeryAsync(
                        owner,
                        "/auth/login",
                        new
                        {
                            email = ownerEmail,
                            password = AuthenticationTestHelpers.Password,
                            rememberMe = false
                        });
                Assert.Equal(System.Net.HttpStatusCode.NoContent, login.StatusCode);

                SongResponse? persisted = await owner.GetFromJsonAsync<SongResponse>(
                    $"/songbooks/{bookId}/songs/{songId}");
                Assert.Equal("Persisted part", persisted?.Parts.Single().Name);

                using HttpClient reader = restartedFactory.CreateSecureClient();
                using HttpResponseMessage readerLogin =
                    await AuthenticationTestHelpers.PostJsonWithAntiforgeryAsync(
                        reader,
                        "/auth/login",
                        new
                        {
                            email = readerEmail,
                            password = AuthenticationTestHelpers.Password,
                            rememberMe = false
                        });
                Assert.Equal(System.Net.HttpStatusCode.NoContent, readerLogin.StatusCode);
                Assert.Equal(
                    "reader",
                    (await reader.GetFromJsonAsync<SongBookResponse>($"/songbooks/{bookId}"))?.AccessLevel);
            }
        }
        finally
        {
            DeleteIfPresent(databasePath);
            DeleteIfPresent(databasePath + "-shm");
            DeleteIfPresent(databasePath + "-wal");
        }
    }

    private Task<HttpClient> CreateUserAsync(string prefix) =>
        AuthenticationTestHelpers.CreateConfirmedClientAsync(
            _factory,
            $"{prefix}-{Guid.NewGuid():N}@example.test");

    private static void DeleteIfPresent(string path)
    {
        if (File.Exists(path))
        {
            File.Delete(path);
        }
    }
}
