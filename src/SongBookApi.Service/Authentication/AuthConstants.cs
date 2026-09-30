namespace SongBookApi.Service.Authentication;

public static class AuthConstants
{
    public const string AuthenticatedUserPolicy = "AuthenticatedUser";
    public const string AntiforgeryHeaderName = "X-CSRF-TOKEN";
}
