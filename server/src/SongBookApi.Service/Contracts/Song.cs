namespace SongBookApi.Service.Contracts;

public sealed record ChordRequest(int? Offset, string? Symbol);

public sealed record CopySongRequest(Guid SourceBookId, Guid SourceSongId);

public sealed record PartRequest(
    Guid? Id,
    string? Name,
    string? Text,
    IReadOnlyList<ChordRequest>? Chords);

public sealed record SongRequest(
    string? Title,
    string? Author,
    string? OriginalTitle,
    string? Number,
    string? Key,
    string? Tempo,
    IReadOnlyList<PartRequest>? Parts,
    long? ExpectedRevision = null);

public sealed record ChordResponse(int Offset, string Symbol);

public sealed record PartResponse(
    Guid Id,
    string? Name,
    string? Text,
    IReadOnlyList<ChordResponse> Chords);

public sealed record SongResponse(
    Guid Id,
    string? Title,
    string? Author,
    string? OriginalTitle,
    string? Number,
    string? Key,
    string? Tempo,
    IReadOnlyList<PartResponse> Parts,
    long Revision = 0);

public sealed record SongSummaryResponse(
    Guid Id,
    string? Title,
    string? Author,
    string? Number);

public sealed record AdjacentSongsResponse(
    SongSummaryResponse? Previous,
    SongSummaryResponse? Next);