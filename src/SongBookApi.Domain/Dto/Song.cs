namespace SongBookApi.Domain.Dto;

public class Song
{
    public Guid Id { get; set; }
    public Guid SongBookId { get; set; }
    public string? Title { get; set; }
    public string? Author { get; set; }
    public string? OriginalTitle { get; set; }
    public string? Number { get; set; }
    public string? Key { get; set; }
    public string? Tempo { get; set; }
    public DateTimeOffset CreatedAtUtc { get; set; }
    public DateTimeOffset UpdatedAtUtc { get; set; }
    public List<Part> Parts { get; set; } = [];
    public Song() => Id = Guid.NewGuid();
}