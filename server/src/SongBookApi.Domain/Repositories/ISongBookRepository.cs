using SongBookApi.Domain.Entities;

namespace SongBookApi.Domain.Repositories;

public sealed record AccessibleSongBook(
    Guid Id,
    string Name,
    string OwnerId,
    SongBookAccessLevel? AccessLevel,
    int SongCount);

public sealed record SongBookCollaborator(
    Guid Id,
    string Email,
    SongBookAccessLevel AccessLevel);

public interface ISongBookRepository
{
    Task<PageResult<AccessibleSongBook>> ListAccessibleAsync(string userId, int page);
    Task<AccessibleSongBook?> GetAccessibleAsync(Guid bookId, string userId);
    Task<SongBook?> GetByIdAsync(Guid bookId);
    Task<bool> OwnerHasNameAsync(string ownerId, string normalizedName, Guid? exceptBookId = null);
    Task<SongBook> AddAsync(SongBook songBook);
    Task RenameAsync(SongBook songBook, string name, string normalizedName, DateTimeOffset updatedAtUtc);
    Task DeleteAsync(SongBook songBook);
    Task<PageResult<SongBookCollaborator>> ListAccessAsync(Guid bookId, int page);
    Task<SongBookAccess?> FindAccessAsync(Guid bookId, string userId);
    Task<SongBookAccess> UpsertAccessAsync(
        Guid bookId,
        string userId,
        SongBookAccessLevel accessLevel,
        DateTimeOffset now);
    Task<bool> RemoveAccessAsync(Guid bookId, Guid accessId);
}
