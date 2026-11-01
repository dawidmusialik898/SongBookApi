namespace SongBookApi.Domain.Entities;

public sealed class SongBookShareLink
{
    public Guid SongBookId { get; set; }
    public string TokenHash { get; set; } = string.Empty;
    public DateTimeOffset CreatedAtUtc { get; set; }
    public string? ActorId { get; set; }
}