namespace SongBookApi.Service.Authentication;

public static class AuthConstants
{
    public const string AuthenticatedUserPolicy = "AuthenticatedUser";
    public const string ModeratorPolicy = "ModeratorOrSuperUser";
    public const string SuperUserPolicy = "SuperUser";
    public const string ModeratorRole = "Moderator";
    public const string SuperUserRole = "SuperUser";
    public const string AntiforgeryHeaderName = "X-CSRF-TOKEN";
}
