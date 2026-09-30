namespace SongBookApi.Service.Contracts;

public sealed record SetSongBookAccessRequest(string? Email, string? AccessLevel);

public sealed record SongBookAccessResponse(
    Guid Id,
    string Email,
    string AccessLevel);
