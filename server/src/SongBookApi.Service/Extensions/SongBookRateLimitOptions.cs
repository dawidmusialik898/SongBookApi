namespace SongBookApi.Service.Extensions;

public sealed class SongBookRateLimitOptions
{
    public const string CollaboratorInvitePolicy = "collaborator-invite";
    public const string PdfGeneratePolicy = "pdf-generate";

    public int CollaboratorInvitePermitLimit { get; set; } = 20;
    public TimeSpan CollaboratorInviteWindow { get; set; } = TimeSpan.FromHours(1);
    public int PdfGeneratePermitLimit { get; set; } = 10;
    public TimeSpan PdfGenerateWindow { get; set; } = TimeSpan.FromHours(1);
}
