using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using SongBookApi.Domain.Entities;
using SongBookApi.Domain.Services;
using SongBookApi.Infrastructure.Identity;
using System.Security.Cryptography;
using System.Text;

namespace SongBookApi.Infrastructure.Repositories;

public sealed class EfShareLinkService(
    SongBookDbContext db, IMutationContext mutation, IActivityWriter writer) : IShareLinkService
{
    public async Task<ShareLinkMetadata> GetAsync(Guid bookId)
    {
        SongBookShareLink? link = await db.SongBookShareLinks.AsNoTracking()
            .SingleOrDefaultAsync(link => link.SongBookId == bookId);
        return new(link is not null, link?.CreatedAtUtc);
    }

    public async Task<CreatedShareLink> ReplaceAsync(Guid bookId)
    {
        await using IDbContextTransaction transaction = await db.Database.BeginTransactionAsync();
        SongBookShareLink? link = await db.SongBookShareLinks
            .SingleOrDefaultAsync(link => link.SongBookId == bookId);
        string operation = link is null ? "link.created" : "link.replaced";
        if (link is null)
        {
            link = new SongBookShareLink { SongBookId = bookId };
            db.SongBookShareLinks.Add(link);
        }

        string token = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32))
            .TrimEnd('=').Replace('+', '-').Replace('/', '_');
        link.TokenHash = Hash(token);
        link.CreatedAtUtc = DateTimeOffset.UtcNow;
        link.ActorId = mutation.Current?.ActorId;
        writer.StageActivity(bookId, operation, ownerOnly: true);
        await db.SaveChangesAsync();
        await transaction.CommitAsync();
        return new(token, link.CreatedAtUtc);
    }

    public async Task RevokeAsync(Guid bookId)
    {
        await using IDbContextTransaction transaction = await db.Database.BeginTransactionAsync();
        SongBookShareLink? link = await db.SongBookShareLinks
            .SingleOrDefaultAsync(link => link.SongBookId == bookId);
        if (link is not null)
        {
            db.SongBookShareLinks.Remove(link);
            writer.StageActivity(bookId, "link.revoked", ownerOnly: true);
            await db.SaveChangesAsync();
        }

        await transaction.CommitAsync();
    }

    public Task<bool> ValidateAsync(Guid bookId, string? token)
    {
        if (token is null || token.Length != 43 ||
            token.Any(character => !char.IsAsciiLetterOrDigit(character) && character is not '-' and not '_'))
        {
            return Task.FromResult(false);
        }

        string hash = Hash(token);
        return db.SongBookShareLinks.AsNoTracking()
            .AnyAsync(link => link.SongBookId == bookId && link.TokenHash == hash);
    }

    public Task<SharedBook?> GetBookAsync(Guid bookId) => db.SongBooks.AsNoTracking()
        .Where(book => book.Id == bookId)
        .Select(book => new SharedBook(book.Id, book.Name, book.Songs.Count))
        .SingleOrDefaultAsync();

    private static string Hash(string token)
        => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token)));
}