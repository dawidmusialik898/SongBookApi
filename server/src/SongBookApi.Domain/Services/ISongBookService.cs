using SongBookApi.Domain.Entities;

namespace SongBookApi.Domain.Services;

public enum EffectiveSongBookAccess
{
    None,
    Reader,
    Editor,
    Admin
}

public sealed record SongBookSummary(
    Guid Id,
    string Name,
    EffectiveSongBookAccess AccessLevel,
    int SongCount);

public sealed record SongBookMember(
    Guid Id,
    string Email,
    SongBookAccessLevel AccessLevel);

public interface ISongBookService
{
    Task<PageResult<SongBookSummary>> ListAsync(string userId, int page);
    Task<SongBookSummary?> GetAsync(Guid bookId, string userId);
    Task<SongBookSummary> CreateAsync(string ownerId, string? name);
    Task RenameAsync(Guid bookId, string ownerId, string? name);
    Task DeleteAsync(Guid bookId, string ownerId);
    Task<PageResult<SongBookMember>> ListMembersAsync(Guid bookId, string ownerId, int page);
    Task<SongBookMember?> SetAccessAsync(
        Guid bookId,
        string ownerId,
        string? email,
        SongBookAccessLevel accessLevel);
    Task<bool> RemoveAccessAsync(Guid bookId, string ownerId, Guid accessId);
}

public sealed class SongBookNameConflictException : Exception
{
}
