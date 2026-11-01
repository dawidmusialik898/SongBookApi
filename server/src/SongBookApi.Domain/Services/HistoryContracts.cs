using SongBookApi.Domain.Dto;

namespace SongBookApi.Domain.Services;

// This context is populated only by authenticated server code, never request JSON.
public sealed record MutationContext(string? ActorId = null, long? ExpectedRevision = null,
    long? RestoredFromRevision = null, string? Operation = null);

public interface IMutationContext
{
    MutationContext Current { get; set; }
}

public sealed class CurrentMutation : IMutationContext
{
    public MutationContext Current { get; set; } = new();
}

// Stage entries before SaveChanges in the caller's transaction. Never saves or commits.
public interface IActivityWriter
{
    void StageActivity(Guid bookId, string operation, Guid? songId = null,
        long? revision = null, bool ownerOnly = false, string? description = null, string? subjectUserId = null);
    void StageRevision(Song song, string operation, long? restoredFromRevision = null,
        bool unattributed = false);
}

public sealed class SongRevisionConflictException(string message = "The song has changed. Reload or compare history before trying again.")
    : Exception(message);

public sealed record ActivitySummary(Guid Id, Guid? SongId, long? Revision, string Operation,
    DateTimeOffset OccurredAtUtc, string Actor, string? Description, string? Subject = null);
public sealed record RevisionSummary(long Revision, string Operation, DateTimeOffset OccurredAtUtc,
    string Actor, long? RestoredFromRevision);
public sealed record SongSnapshot(int SchemaVersion, Song Song);
public sealed record RevisionDetail(RevisionSummary Summary, SongSnapshot Snapshot);
public sealed record SongHistory(PageResult<RevisionSummary> Revisions, long LatestRevision, bool Deleted);

public interface IHistoryRepository
{
    Task<PageResult<ActivitySummary>> GetBookHistoryAsync(Guid bookId, bool includeOwnerOnly, int page);
    Task<SongHistory?> GetSongHistoryAsync(Guid bookId, Guid songId, int page);
    Task<RevisionDetail?> GetSnapshotAsync(Guid bookId, Guid songId, long revision);
    Task<Song?> RestoreAsync(Guid bookId, Guid songId, long revision, long expectedRevision);
}