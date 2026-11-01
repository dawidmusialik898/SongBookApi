namespace SongBookApi.Domain.Services;

public sealed record ShareLinkMetadata(bool Enabled, DateTimeOffset? CreatedAtUtc);
public sealed record CreatedShareLink(string Token, DateTimeOffset CreatedAtUtc);
public sealed record SharedBook(Guid Id, string Name, int SongCount);

public interface IShareLinkService
{
    Task<ShareLinkMetadata> GetAsync(Guid bookId);
    Task<CreatedShareLink> ReplaceAsync(Guid bookId);
    Task RevokeAsync(Guid bookId);
    Task<bool> ValidateAsync(Guid bookId, string? token);
    Task<SharedBook?> GetBookAsync(Guid bookId);
}