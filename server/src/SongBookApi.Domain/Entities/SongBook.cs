using SongBookApi.Domain.Dto;

namespace SongBookApi.Domain.Entities;

public sealed class SongBook
{
    public Guid Id { get; set; }
    public required string Name { get; set; }
    public required string NormalizedName { get; set; }
    public required string OwnerId { get; set; }
    public DateTimeOffset CreatedAtUtc { get; set; }
    public DateTimeOffset UpdatedAtUtc { get; set; }
    public long ContentRevision { get; set; }
    public List<Song> Songs { get; set; } = [];
    public List<SongBookAccess> AccessEntries { get; set; } = [];
}
