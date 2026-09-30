namespace SongBookApi.Service.Authentication;

public sealed class DevelopmentAccountEmailSender(
    ILogger<DevelopmentAccountEmailSender> logger) : IAccountEmailSender
{
    public Task SendConfirmationLinkAsync(string email, string link)
    {
        logger.LogWarning(
            "Development-only sensitive email confirmation link for {Email}: {Link}. Do not use this logger in production.",
            email,
            link);
        return Task.CompletedTask;
    }

    public Task SendPasswordResetLinkAsync(string email, string link)
    {
        logger.LogWarning(
            "Development-only sensitive password reset link for {Email}: {Link}. Do not use this logger in production.",
            email,
            link);
        return Task.CompletedTask;
    }
}
