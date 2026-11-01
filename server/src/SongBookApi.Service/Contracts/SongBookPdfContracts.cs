namespace SongBookApi.Service.Contracts;

public sealed record GenerateSongBookPdfRequest(
    bool? IncludeChords,
    IReadOnlyList<Guid>? SongIds,
    string? FontFamily = null,
    decimal? FontSize = null,
    string? Orientation = null,
    decimal? Columns = null);