namespace SongBookApi.Service.Contracts;

public sealed record SongBookNameRequest(string? Name);

public sealed record SongBookResponse(
    Guid Id,
    string Name,
    string AccessLevel,
    int SongCount);
