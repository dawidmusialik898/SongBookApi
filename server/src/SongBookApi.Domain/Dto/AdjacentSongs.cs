namespace SongBookApi.Domain.Dto;

public sealed record AdjacentSongs(SongSummary? Previous, SongSummary? Next);
