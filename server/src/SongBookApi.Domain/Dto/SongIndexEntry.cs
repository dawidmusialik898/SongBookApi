namespace SongBookApi.Domain.Dto;

public sealed record SongIndexEntry(
    Guid Id,
    string? Title,
    string? OriginalTitle,
    string? Author,
    string? Number);
