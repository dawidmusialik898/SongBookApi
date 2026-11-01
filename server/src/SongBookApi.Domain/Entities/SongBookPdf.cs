namespace SongBookApi.Domain.Entities;

public sealed class SongBookPdf
{
    public Guid Id { get; set; }
    public Guid SongBookId { get; set; }
    public DateTimeOffset GeneratedAtUtc { get; set; }
    public long ContentRevision { get; set; }
    public bool IncludeChords { get; set; }
    public bool IsWholeBook { get; set; }
    public int SongCount { get; set; }
    public string FontFamily { get; set; } = "lato";
    public int FontSize { get; set; } = 10;
    public string Orientation { get; set; } = "portrait";
    public int Columns { get; set; } = 1;
    public required string SelectedSongsJson { get; set; }
    public required byte[] Content { get; set; }
    public SongBook SongBook { get; set; } = null!;
}