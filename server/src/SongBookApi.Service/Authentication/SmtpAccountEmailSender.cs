using System.ComponentModel.DataAnnotations;
using MailKit.Net.Smtp;
using MailKit.Security;
using MimeKit;

namespace SongBookApi.Service.Authentication;

public sealed class SmtpAccountEmailSender : IAccountEmailSender
{
    private readonly string _host;
    private readonly int _port;
    private readonly string _userName;
    private readonly string _password;
    private readonly string _fromAddress;
    private readonly string _fromName;
    private readonly Func<SmtpClient> _createClient;

    public SmtpAccountEmailSender(IConfiguration configuration)
        : this(configuration, static () => new SmtpClient())
    {
    }

    internal SmtpAccountEmailSender(IConfiguration configuration, Func<SmtpClient> createClient)
    {
        ArgumentNullException.ThrowIfNull(configuration);
        _createClient = createClient ?? throw new ArgumentNullException(nameof(createClient));

        _host = Required(configuration, "Email:Smtp:Host");
        if (Uri.CheckHostName(_host) == UriHostNameType.Unknown)
        {
            throw new InvalidOperationException("Email:Smtp:Host must be a valid host name or IP address.");
        }

        if (!int.TryParse(configuration["Email:Smtp:Port"], out int port) || port is < 1 or > 65535)
        {
            throw new InvalidOperationException("Email:Smtp:Port must be a valid TCP port.");
        }

        _port = port;
        _userName = Required(configuration, "Email:Smtp:UserName");
        _password = Required(configuration, "Email:Smtp:Password");
        _fromAddress = Required(configuration, "Email:Smtp:FromAddress");
        if (!new EmailAddressAttribute().IsValid(_fromAddress) ||
            !MailboxAddress.TryParse(_fromAddress, out MailboxAddress? from) ||
            !string.Equals(from.Address, _fromAddress, StringComparison.Ordinal))
        {
            throw new InvalidOperationException("Email:Smtp:FromAddress must be a single email address.");
        }

        _fromName = configuration["Email:Smtp:FromName"] ?? "SongBook";
        if (_fromName.Any(char.IsControl))
        {
            throw new InvalidOperationException("Email:Smtp:FromName must not contain control characters.");
        }
    }

    public Task SendConfirmationLinkAsync(string email, string link) =>
        SendAsync(email, "Confirm your SongBook email", "Confirm your email address using this link:", link);

    public Task SendPasswordResetLinkAsync(string email, string link) =>
        SendAsync(email, "Reset your SongBook password", "Reset your password using this link:", link);

    private async Task SendAsync(string email, string subject, string introduction, string link)
    {
        if (!new EmailAddressAttribute().IsValid(email))
        {
            throw new ArgumentException("A valid email address is required.", nameof(email));
        }

        MailboxAddress recipient = MailboxAddress.Parse(email);
        if (!string.Equals(recipient.Address, email, StringComparison.Ordinal))
        {
            throw new ArgumentException("A single email address is required.", nameof(email));
        }

        MimeMessage message = new();
        message.From.Add(new MailboxAddress(_fromName, _fromAddress));
        message.To.Add(recipient);
        message.Subject = subject;
        message.Body = new TextPart("plain")
        {
            Text = $"{introduction}\n\n{link}\n\nIf you did not request this, you can ignore this message."
        };

        using SmtpClient client = _createClient();
        client.Timeout = 30_000;
        await client.ConnectAsync(
            _host,
            _port,
            _port == 465 ? SecureSocketOptions.SslOnConnect : SecureSocketOptions.StartTls);
        await client.AuthenticateAsync(_userName, _password);
        await client.SendAsync(message);
        await client.DisconnectAsync(true);
    }

    private static string Required(IConfiguration configuration, string key)
    {
        string? value = configuration[key];
        return !string.IsNullOrWhiteSpace(value)
            ? value
            : throw new InvalidOperationException($"{key} is required for production email delivery.");
    }
}
