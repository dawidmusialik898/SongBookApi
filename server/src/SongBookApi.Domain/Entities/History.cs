namespace SongBookApi.Domain.Entities;

public sealed class BookActivity
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid SongBookId { get; set; }
    public Guid? SongId { get; set; }
    public long? Revision { get; set; }
    public string Operation { get; set; } = string.Empty;
    public DateTimeOffset OccurredAtUtc { get; set; }
    public string? ActorId { get; set; }
    public bool OwnerOnly { get; set; }
    public string? SubjectUserId { get; set; }
    public string? Description { get; set; }
}

public sealed class SongRevision
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid SongBookId { get; set; }
    public Guid SongId { get; set; }
    public long Revision { get; set; }
    public string Operation { get; set; } = string.Empty;
    public DateTimeOffset OccurredAtUtc { get; set; }
    public string? ActorId { get; set; }
    public long? RestoredFromRevision { get; set; }
    public string SnapshotJson { get; set; } = string.Empty;
}