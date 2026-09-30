namespace SongBookApi.Service.Contracts;

public sealed record PartRequest(Guid? Id, string? Name, string? Text);

public sealed record SongRequest(
    string? Title,
    string? Author,
    string? OriginalTitle,
    string? Number,
    string? Key,
    string? Tempo,
    IReadOnlyList<PartRequest>? Parts);

public sealed record PartResponse(Guid Id, string? Name, string? Text);

public sealed record SongResponse(
    Guid Id,
    string? Title,
    string? Author,
    string? OriginalTitle,
    string? Number,
    string? Key,
    string? Tempo,
    IReadOnlyList<PartResponse> Parts);
