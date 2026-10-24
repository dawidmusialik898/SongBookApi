namespace SongBookApi.Service.Contracts;

public sealed record GenerateSongBookPdfRequest(bool? IncludeChords, IReadOnlyList<Guid>? SongIds);
