namespace SongBookApi.Domain.Dto;

public sealed record SongSummary(
    Guid Id,
    string? Title,
    string? Author,
    string? Number);
