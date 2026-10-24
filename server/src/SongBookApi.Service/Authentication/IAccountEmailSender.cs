namespace SongBookApi.Service.Authentication;

public interface IAccountEmailSender
{
    Task SendConfirmationLinkAsync(string email, string link);
    Task SendPasswordResetLinkAsync(string email, string link);
}
