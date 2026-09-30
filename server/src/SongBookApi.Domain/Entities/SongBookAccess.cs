namespace SongBookApi.Domain.Entities;

public sealed class SongBookAccess
{
    public Guid Id { get; set; }
    public Guid SongBookId { get; set; }
    public required string UserId { get; set; }
    public SongBookAccessLevel AccessLevel { get; set; }
    public DateTimeOffset CreatedAtUtc { get; set; }
    public DateTimeOffset UpdatedAtUtc { get; set; }
    public SongBook SongBook { get; set; } = null!;
}
