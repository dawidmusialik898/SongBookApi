using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SongBookApi.Domain;
using SongBookApi.Domain.Dto;
using SongBookApi.Domain.Entities;
using SongBookApi.Infrastructure.Identity;
using SongBookApi.Service.Contracts;

namespace SongBookApi.Service.Tests;

[Trait("Category", "Integration")]
public sealed class CollectionPagingTests
{
    [Fact]
    public async Task SongPagesAreBoundedSummariesWithoutLyrics()
    {
        using TestApplicationFactory factory = new();
        using HttpClient owner = await AuthenticationTestHelpers.CreateConfirmedClientAsync(
            factory, $"song-pages-{Guid.NewGuid():N}@example.test");
        SongBookResponse book = await SongBookTestHelpers.CreateBookAsync(owner, "Paged songs");

        using (IServiceScope scope = factory.Services.CreateScope())
        {
            SongBookDbContext db = scope.ServiceProvider.GetRequiredService<SongBookDbContext>();
            db.Songs.AddRange(Enumerable.Range(0, 51).Select(index => new Song
            {
                SongBookId = book.Id,
                Title = $"Song {index:D3}",
                Author = "Author",
                Number = index.ToString(),
                Parts = [new Part { Name = "Verse", Text = "Private lyric" }]
            }));
            await db.SaveChangesAsync();
        }

        using HttpResponseMessage firstResponse =
            await owner.GetAsync($"/songbooks/{book.Id}/songs");
        Assert.Equal(HttpStatusCode.OK, firstResponse.StatusCode);
        string firstJson = await firstResponse.Content.ReadAsStringAsync();
        Assert.DoesNotContain("Private lyric", firstJson);
        using JsonDocument firstPayload = JsonDocument.Parse(firstJson);
        JsonElement root = firstPayload.RootElement;
        Assert.Equal(1, root.GetProperty("page").GetInt32());
        Assert.True(root.GetProperty("hasNext").GetBoolean());
        Assert.Equal(50, root.GetProperty("items").GetArrayLength());
        Assert.False(root.GetProperty("items")[0].TryGetProperty("parts", out _));
        PageResult<SongSummaryResponse> first =
            (await firstResponse.Content.ReadFromJsonAsync<PageResult<SongSummaryResponse>>())!;
        Assert.Equal(1, first.Page);
        Assert.Equal(50, first.Items.Count);
        Assert.True(first.HasNext);
        Assert.Equal("Song 000", first.Items[0].Title);

        PageResult<SongSummaryResponse> second =
            (await owner.GetFromJsonAsync<PageResult<SongSummaryResponse>>(
                $"/songbooks/{book.Id}/songs?page=2"))!;
        Assert.Equal(2, second.Page);
        Assert.Single(second.Items);
        Assert.Equal("Song 050", second.Items[0].Title);
        Assert.False(second.HasNext);
        PageResult<SongSummaryResponse> empty =
            (await owner.GetFromJsonAsync<PageResult<SongSummaryResponse>>(
                $"/songbooks/{book.Id}/songs?page=3"))!;
        Assert.Empty(empty.Items);
        Assert.False(empty.HasNext);

        SongResponse detail = (await owner.GetFromJsonAsync<SongResponse>(
            $"/songbooks/{book.Id}/songs/{second.Items[0].Id}"))!;
        Assert.Equal("Private lyric", detail.Parts[0].Text);

        Assert.Equal(HttpStatusCode.BadRequest,
            (await owner.GetAsync($"/songbooks/{book.Id}/songs?page=0")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,
            (await owner.GetAsync($"/songbooks/{book.Id}/songs?page={int.MaxValue}")).StatusCode);
    }

    [Fact]
    public async Task BookAndCollaboratorPagesRemainScopedToTheirOwner()
    {
        using TestApplicationFactory factory = new();
        string ownerEmail = $"owner-pages-{Guid.NewGuid():N}@example.test";
        using HttpClient owner = await AuthenticationTestHelpers.CreateConfirmedClientAsync(
            factory, ownerEmail);
        using HttpClient other = await AuthenticationTestHelpers.CreateConfirmedClientAsync(
            factory, $"other-pages-{Guid.NewGuid():N}@example.test");
        SongBookResponse book = await SongBookTestHelpers.CreateBookAsync(owner, "Book 000");
        _ = await SongBookTestHelpers.CreateBookAsync(other, "Other book");

        using (IServiceScope scope = factory.Services.CreateScope())
        {
            SongBookDbContext db = scope.ServiceProvider.GetRequiredService<SongBookDbContext>();
            string ownerId = (await db.Users.SingleAsync(user =>
                user.Email == ownerEmail))!.Id;
            db.SongBooks.AddRange(Enumerable.Range(1, 50).Select(index => new SongBook
            {
                Id = Guid.NewGuid(),
                Name = $"Book {index:D3}",
                NormalizedName = $"BOOK {index:D3}",
                OwnerId = ownerId
            }));
            var members = Enumerable.Range(0, 51).Select(index =>
            {
                string email = $"member-{index:D3}-{book.Id:N}@example.test";
                return new ApplicationUser
                {
                    Id = Guid.NewGuid().ToString(),
                    Email = email,
                    NormalizedEmail = email.ToUpperInvariant(),
                    UserName = email,
                    NormalizedUserName = email.ToUpperInvariant(),
                    EmailConfirmed = true
                };
            }).ToArray();
            db.Users.AddRange(members);
            db.SongBookAccessEntries.AddRange(members.Select(member => new SongBookAccess
            {
                Id = Guid.NewGuid(),
                SongBookId = book.Id,
                UserId = member.Id,
                AccessLevel = SongBookAccessLevel.Reader
            }));
            await db.SaveChangesAsync();
        }

        PageResult<SongBookResponse> books =
            (await owner.GetFromJsonAsync<PageResult<SongBookResponse>>("/songbooks"))!;
        Assert.Equal(50, books.Items.Count);
        Assert.True(books.HasNext);
        PageResult<SongBookResponse> lastBook =
            (await owner.GetFromJsonAsync<PageResult<SongBookResponse>>("/songbooks?page=2"))!;
        Assert.Single(lastBook.Items);
        Assert.False(lastBook.HasNext);
        Assert.DoesNotContain(books.Items.Concat(lastBook.Items),
            candidate => candidate.Name == "Other book");
        Assert.Equal(HttpStatusCode.BadRequest,
            (await owner.GetAsync("/songbooks?page=-1")).StatusCode);

        PageResult<SongBookAccessResponse> access =
            (await owner.GetFromJsonAsync<PageResult<SongBookAccessResponse>>(
                $"/songbooks/{book.Id}/access"))!;
        Assert.Equal(50, access.Items.Count);
        Assert.True(access.HasNext);
        PageResult<SongBookAccessResponse> lastAccess =
            (await owner.GetFromJsonAsync<PageResult<SongBookAccessResponse>>(
                $"/songbooks/{book.Id}/access?page=2"))!;
        Assert.Single(lastAccess.Items);
        Assert.False(lastAccess.HasNext);
        Assert.Equal(HttpStatusCode.NotFound,
            (await other.GetAsync($"/songbooks/{book.Id}/access?page=2")).StatusCode);
    }

    [Fact]
    public async Task ModerationPagesExcludeCallerAndLoadOnlyVisibleRoles()
    {
        string superEmail = $"super-pages-{Guid.NewGuid():N}@example.test";
        using TestApplicationFactory factory = new(false, superEmail);
        using HttpClient admin =
            await AuthenticationTestHelpers.CreateConfirmedClientAsync(factory, superEmail);

        using (IServiceScope scope = factory.Services.CreateScope())
        {
            SongBookDbContext db = scope.ServiceProvider.GetRequiredService<SongBookDbContext>();
            var members = Enumerable.Range(0, 51).Select(index =>
            {
                string email = $"user-{index:D3}-{Guid.NewGuid():N}@example.test";
                return new ApplicationUser
                {
                    Id = Guid.NewGuid().ToString(),
                    Email = email,
                    NormalizedEmail = email.ToUpperInvariant(),
                    UserName = email,
                    NormalizedUserName = email.ToUpperInvariant(),
                    EmailConfirmed = true
                };
            }).ToArray();
            db.Users.AddRange(members);
            db.UserRoles.Add(new IdentityUserRole<string>
            {
                UserId = members[50].Id,
                RoleId = "6e0b41f9-7922-4b8b-841c-2b533519d142"
            });
            await db.SaveChangesAsync();
        }

        PageResult<ModeratedUserResponse> first =
            (await admin.GetFromJsonAsync<PageResult<ModeratedUserResponse>>("/admin/users"))!;
        PageResult<ModeratedUserResponse> second =
            (await admin.GetFromJsonAsync<PageResult<ModeratedUserResponse>>("/admin/users?page=2"))!;
        Assert.Equal(50, first.Items.Count);
        Assert.True(first.HasNext);
        Assert.Single(second.Items);
        Assert.False(second.HasNext);
        Assert.Equal("moderator", second.Items[0].Role);
        Assert.DoesNotContain(first.Items.Concat(second.Items),
            candidate => candidate.Email == superEmail);
        Assert.Equal(HttpStatusCode.BadRequest,
            (await admin.GetAsync("/admin/users?page=0")).StatusCode);
    }
}
