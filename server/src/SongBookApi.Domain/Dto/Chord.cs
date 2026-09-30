namespace SongBookApi.Domain.Dto;

public sealed class Chord
{
    public Guid PartId { get; set; }
    public int Offset { get; set; }
    public string Symbol { get; set; } = string.Empty;
}
