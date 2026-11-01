using Microsoft.EntityFrameworkCore;
using Microsoft.Data.Sqlite;
using SongBookApi.Domain;
using SongBookApi.Domain.Entities;
using SongBookApi.Domain.Repositories;
using SongBookApi.Infrastructure.Identity;
using Microsoft.EntityFrameworkCore.Storage;
using SongBookApi.Domain.Services;

namespace SongBookApi.Infrastructure.Repositories;

public sealed class EfSongBookRepository(SongBookDbContext dbContext, IMutationContext? mutationContext = null,
    IActivityWriter? activityWriter = null) : ISongBookRepository
{
    private IActivityWriter Writer => activityWriter ?? new EfActivityWriter(dbContext, mutationContext ?? new CurrentMutation());
    public async Task<PageResult<AccessibleSongBook>> ListAccessibleAsync(string userId, int page)
        => Paging.FromLookahead(await dbContext.SongBooks
            .AsNoTracking()
            .Where(book => book.OwnerId == userId ||
                book.AccessEntries.Any(entry => entry.UserId == userId))
            .OrderBy(book => book.Name)
            .ThenBy(book => book.Id)
            .Skip(Paging.Offset(page))
            .Take(Paging.Size + 1)
            .Select(book => new AccessibleSongBook(
                book.Id,
                book.Name,
                book.OwnerId,
                book.OwnerId == userId
                    ? null
                    : book.AccessEntries
                        .Where(entry => entry.UserId == userId)
                        .Select(entry => (SongBookAccessLevel?)entry.AccessLevel)
                        .Single(),
                book.Songs.Count))
            .ToListAsync(), page);

    public async Task<AccessibleSongBook?> GetAccessibleAsync(Guid bookId, string userId)
        => await dbContext.SongBooks
            .AsNoTracking()
            .Where(book => book.Id == bookId &&
                (book.OwnerId == userId || book.AccessEntries.Any(entry => entry.UserId == userId)))
            .Select(book => new AccessibleSongBook(
                book.Id,
                book.Name,
                book.OwnerId,
                book.OwnerId == userId
                    ? null
                    : book.AccessEntries
                        .Where(entry => entry.UserId == userId)
                        .Select(entry => (SongBookAccessLevel?)entry.AccessLevel)
                        .Single(),
                book.Songs.Count))
            .SingleOrDefaultAsync();

    public Task<SongBook?> GetByIdAsync(Guid bookId)
        => dbContext.SongBooks.SingleOrDefaultAsync(book => book.Id == bookId);

    public Task<bool> OwnerHasNameAsync(string ownerId, string normalizedName, Guid? exceptBookId = null)
        => dbContext.SongBooks.AnyAsync(book =>
            book.OwnerId == ownerId &&
            book.NormalizedName == normalizedName &&
            (!exceptBookId.HasValue || book.Id != exceptBookId.Value));

    public async Task<SongBook> AddAsync(SongBook songBook)
    {
        dbContext.SongBooks.Add(songBook);
        Writer.StageActivity(songBook.Id, "book.created", description: songBook.Name);
        await dbContext.SaveChangesAsync();
        return songBook;
    }

    public async Task RenameAsync(
        SongBook songBook,
        string name,
        string normalizedName,
        DateTimeOffset updatedAtUtc)
    {
        await using IDbContextTransaction transaction = await dbContext.Database.BeginTransactionAsync();
        string previousName = songBook.Name;
        songBook.Name = name;
        songBook.NormalizedName = normalizedName;
        songBook.UpdatedAtUtc = updatedAtUtc;
        Writer.StageActivity(songBook.Id, "book.renamed", description: $"{previousName} → {name}");
        await dbContext.SaveChangesAsync();
        await dbContext.SongBooks
            .Where(book => book.Id == songBook.Id)
            .ExecuteUpdateAsync(setters => setters.SetProperty(
                book => book.ContentRevision, book => book.ContentRevision + 1));
        await transaction.CommitAsync();
    }

    public async Task DeleteAsync(SongBook songBook)
    {
        dbContext.SongBooks.Remove(songBook);
        await dbContext.SaveChangesAsync();
    }

    public async Task<PageResult<SongBookCollaborator>> ListAccessAsync(Guid bookId, int page)
        => Paging.FromLookahead(await (
            from access in dbContext.SongBookAccessEntries.AsNoTracking()
            join user in dbContext.Users.AsNoTracking() on access.UserId equals user.Id
            where access.SongBookId == bookId
            orderby user.Email, access.Id
            select new SongBookCollaborator(
                access.Id,
                user.Email!,
                access.AccessLevel))
            .Skip(Paging.Offset(page))
            .Take(Paging.Size + 1)
            .ToListAsync(), page);

    public Task<SongBookAccess?> FindAccessAsync(Guid bookId, string userId)
        => dbContext.SongBookAccessEntries.SingleOrDefaultAsync(entry =>
            entry.SongBookId == bookId && entry.UserId == userId);

    public async Task<SongBookAccess> UpsertAccessAsync(
        Guid bookId,
        string userId,
        SongBookAccessLevel accessLevel,
        DateTimeOffset now)
    {
        await using IDbContextTransaction transaction = await dbContext.Database.BeginTransactionAsync();
        SongBookAccess? access = await FindAccessAsync(bookId, userId);
        string operation = access is null ? "collaborator.added" : "collaborator.changed";
        string? previousLevel = access?.AccessLevel.ToString();
        if (access is null)
        {
            access = new SongBookAccess
            {
                Id = Guid.NewGuid(),
                SongBookId = bookId,
                UserId = userId,
                AccessLevel = accessLevel,
                CreatedAtUtc = now,
                UpdatedAtUtc = now
            };
            dbContext.SongBookAccessEntries.Add(access);
        }
        else
        {
            access.AccessLevel = accessLevel;
            access.UpdatedAtUtc = now;
        }

        Writer.StageActivity(bookId, operation, ownerOnly: true,
            description: previousLevel is null ? accessLevel.ToString() : $"{previousLevel} → {accessLevel}", subjectUserId: userId);
        try
        {
            await dbContext.SaveChangesAsync();
        }
        catch (DbUpdateException exception)
            when (
                access.Id != Guid.Empty &&
                dbContext.Entry(access).State == EntityState.Added &&
                exception.InnerException is SqliteException
                {
                    SqliteExtendedErrorCode: 2067
                })
        {
            dbContext.Entry(access).State = EntityState.Detached;
            SongBookAccess? existing = await FindAccessAsync(
                bookId,
                userId
            );
            if (existing is null)
            {
                throw;
            }

            access = existing;
            access.AccessLevel = accessLevel;
            access.UpdatedAtUtc = now;
            await dbContext.SaveChangesAsync();
        }

        await transaction.CommitAsync();
        return access;
    }

    public async Task<bool> RemoveAccessAsync(Guid bookId, Guid accessId)
    {
        await using IDbContextTransaction transaction = await dbContext.Database.BeginTransactionAsync();
        SongBookAccess? access = await dbContext.SongBookAccessEntries.SingleOrDefaultAsync(entry =>
            entry.SongBookId == bookId && entry.Id == accessId);
        if (access is null)
        {
            return false;
        }

        dbContext.SongBookAccessEntries.Remove(access);
        Writer.StageActivity(bookId, "collaborator.removed", ownerOnly: true, subjectUserId: access.UserId);
        await dbContext.SaveChangesAsync();
        await transaction.CommitAsync();
        return true;
    }
}