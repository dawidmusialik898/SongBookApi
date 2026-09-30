namespace SongBookApi.Service.Contracts;

public sealed record ModeratedUserResponse(
    string Id, string? Email, string Role, bool IsBanned, bool EmailConfirmed);
public sealed record SetUserRoleRequest(string? Role);
public sealed record SetUserBanRequest(bool? IsBanned);
