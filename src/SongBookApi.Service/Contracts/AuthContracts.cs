namespace SongBookApi.Service.Contracts;

public sealed record RegisterRequest(string? Email, string? Password);
public sealed record LoginRequest(string? Email, string? Password, bool RememberMe);
public sealed record EmailRequest(string? Email);
public sealed record ResetPasswordRequest(string? Email, string? Code, string? NewPassword);
public sealed record AuthenticatedUserResponse(bool IsAuthenticated, string? Email, string? Role);
public sealed record AntiforgeryTokenResponse(string Token);
