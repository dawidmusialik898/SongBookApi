using System.Net;
using System.Net.Security;
using System.Net.Sockets;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Text;
using MailKit.Net.Smtp;
using Microsoft.AspNetCore.Builder;
using Microsoft.Data.Sqlite;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using MimeKit;
using SongBookApi.Service.Authentication;
using SongBookApi.Service.Extensions;

namespace SongBookApi.Service.Tests;

public sealed class SmtpAccountEmailSenderTests
{
    [Theory]
    [InlineData("Email:Smtp:Host", null)]
    [InlineData("Email:Smtp:Host", "smtp.example.test/unsafe")]
    [InlineData("Email:Smtp:Port", "0")]
    [InlineData("Email:Smtp:Port", "65536")]
    [InlineData("Email:Smtp:Port", "not-a-port")]
    [InlineData("Email:Smtp:UserName", "")]
    [InlineData("Email:Smtp:Password", null)]
    [InlineData("Email:Smtp:FromAddress", "invalid")]
    [InlineData("Email:Smtp:FromAddress", "Someone <no-reply@example.test>")]
    [InlineData("Email:Smtp:FromName", "Someone\r\nBcc: other@example.test")]
    public void InvalidSettings_RejectProductionStartup(string key, string? value)
    {
        Dictionary<string, string?> values = ValidSettings();
        values[key] = value;
        IConfiguration configuration = new ConfigurationBuilder().AddInMemoryCollection(values).Build();

        InvalidOperationException error = Assert.Throws<InvalidOperationException>(
            () => new SmtpAccountEmailSender(configuration));

        Assert.Contains(key, error.Message, StringComparison.Ordinal);
    }

    [Fact]
    public void Production_RegistersTheSmtpSender()
    {
        WebApplicationBuilder builder = WebApplication.CreateBuilder(new WebApplicationOptions
        {
            EnvironmentName = "Production"
        });
        builder.Configuration.AddInMemoryCollection(ValidSettings());
        builder.Services.AddSongBookAuthentication(builder.Configuration, builder.Environment);

        using WebApplication app = builder.Build();

        Assert.IsType<SmtpAccountEmailSender>(app.Services.GetRequiredService<IAccountEmailSender>());
    }

    [Fact]
    public void Production_RejectsMissingSmtpCredentials()
    {
        WebApplicationBuilder builder = WebApplication.CreateBuilder(new WebApplicationOptions
        {
            EnvironmentName = "Production"
        });
        Dictionary<string, string?> values = ValidSettings();
        values.Remove("Email:Smtp:Password");
        builder.Configuration.AddInMemoryCollection(values);

        InvalidOperationException error = Assert.Throws<InvalidOperationException>(
            () => builder.Services.AddSongBookAuthentication(builder.Configuration, builder.Environment));

        Assert.Contains("Email:Smtp:Password", error.Message, StringComparison.Ordinal);
    }

    [Fact]
    public void Development_KeepsTheLogOnlySender()
    {
        WebApplicationBuilder builder = WebApplication.CreateBuilder(new WebApplicationOptions
        {
            EnvironmentName = "Development"
        });
        Dictionary<string, string?> values = ValidSettings();
        foreach (string key in values.Keys.Where(key => key.StartsWith("Email:Smtp:", StringComparison.Ordinal)).ToArray())
        {
            values.Remove(key);
        }

        builder.Configuration.AddInMemoryCollection(values);
        builder.Services.AddSongBookAuthentication(builder.Configuration, builder.Environment);

        using WebApplication app = builder.Build();

        Assert.IsType<DevelopmentAccountEmailSender>(app.Services.GetRequiredService<IAccountEmailSender>());
    }

    [Theory]
    [InlineData(false, "Confirm your SongBook email", "https://songbook.test/auth/confirm-email?code=example")]
    [InlineData(true, "Reset your SongBook password", "https://songbook.test/?auth=reset-password&code=example")]
    public async Task SendsAccountLinksViaAuthenticatedTls(
        bool passwordReset,
        string subject,
        string link)
    {
        using RecordingSmtpServer server = new();
        Dictionary<string, string?> values = ValidSettings();
        values["Email:Smtp:Port"] = server.Port.ToString();
        IConfiguration configuration = new ConfigurationBuilder().AddInMemoryCollection(values).Build();
        SmtpAccountEmailSender sender = new(configuration, () => new SmtpClient
        {
            ServerCertificateValidationCallback = (_, certificate, _, _) =>
                certificate is not null &&
                string.Equals(
                    certificate.GetCertHashString(),
                    server.CertificateThumbprint,
                    StringComparison.OrdinalIgnoreCase)
        });

        if (passwordReset)
        {
            await sender.SendPasswordResetLinkAsync("registered@example.test", link);
        }
        else
        {
            await sender.SendConfirmationLinkAsync("registered@example.test", link);
        }

        MimeMessage message = await server.ReceivedMessage;
        Assert.Equal("no-reply@example.test", Assert.Single(message.From.Mailboxes).Address);
        Assert.Equal("registered@example.test", Assert.Single(message.To.Mailboxes).Address);
        Assert.Equal(subject, message.Subject);
        Assert.Contains(link, message.TextBody, StringComparison.Ordinal);
    }

    private static Dictionary<string, string?> ValidSettings() => new()
    {
        ["ConnectionStrings:SongBookConnection"] = new SqliteConnectionStringBuilder
        {
            DataSource = Path.Combine(Path.GetTempPath(), "songbook-smtp-tests.db")
        }.ConnectionString,
        ["DataProtection:KeyDirectory"] = Path.GetTempPath(),
        ["AllowedHosts"] = "songbook.test",
        ["AccountLinks:PublicOrigin"] = "https://songbook.test",
        ["Email:Smtp:Host"] = "127.0.0.1",
        ["Email:Smtp:Port"] = "587",
        ["Email:Smtp:UserName"] = "smtp-user",
        ["Email:Smtp:Password"] = "test-password",
        ["Email:Smtp:FromAddress"] = "no-reply@example.test",
        ["Email:Smtp:FromName"] = "SongBook"
    };

    private sealed class RecordingSmtpServer : IDisposable
    {
        private readonly TcpListener _listener = new(IPAddress.Loopback, 0);
        private readonly RSA _key = RSA.Create(2048);
        private readonly X509Certificate2 _certificate;
        private readonly CancellationTokenSource _timeout = new(TimeSpan.FromSeconds(20));

        public RecordingSmtpServer()
        {
            CertificateRequest request = new(
                "CN=localhost",
                _key,
                HashAlgorithmName.SHA256,
                RSASignaturePadding.Pkcs1);
            request.CertificateExtensions.Add(new X509BasicConstraintsExtension(false, false, 0, false));
            request.CertificateExtensions.Add(new X509KeyUsageExtension(X509KeyUsageFlags.DigitalSignature, false));
            SubjectAlternativeNameBuilder alternativeNames = new();
            alternativeNames.AddIpAddress(IPAddress.Loopback);
            request.CertificateExtensions.Add(alternativeNames.Build());
            _certificate = request.CreateSelfSigned(
                DateTimeOffset.UtcNow.AddMinutes(-1),
                DateTimeOffset.UtcNow.AddMinutes(5));

            _listener.Start();
            Port = ((IPEndPoint)_listener.LocalEndpoint).Port;
            ReceivedMessage = ReceiveAsync();
        }

        public int Port { get; }
        public string CertificateThumbprint => _certificate.Thumbprint;
        public Task<MimeMessage> ReceivedMessage { get; }

        public void Dispose()
        {
            _timeout.Cancel();
            _listener.Stop();
            _certificate.Dispose();
            _key.Dispose();
            _timeout.Dispose();
        }

        private async Task<MimeMessage> ReceiveAsync()
        {
            using TcpClient client = await _listener.AcceptTcpClientAsync(_timeout.Token);
            using NetworkStream network = client.GetStream();
            using (StreamReader reader = CreateReader(network))
            using (StreamWriter writer = CreateWriter(network))
            {
                await writer.WriteLineAsync("220 localhost ESMTP");
                Assert.StartsWith("EHLO ", await reader.ReadLineAsync(_timeout.Token));
                await writer.WriteLineAsync("250-localhost");
                await writer.WriteLineAsync("250-STARTTLS");
                await writer.WriteLineAsync("250 SIZE 100000");
                Assert.Equal("STARTTLS", await reader.ReadLineAsync(_timeout.Token));
                await writer.WriteLineAsync("220 Ready for TLS");
            }

            using SslStream secureStream = new(network, leaveInnerStreamOpen: true);
            await secureStream.AuthenticateAsServerAsync(_certificate);
            using StreamReader secureReader = CreateReader(secureStream);
            using StreamWriter secureWriter = CreateWriter(secureStream);
            Assert.StartsWith("EHLO ", await secureReader.ReadLineAsync(_timeout.Token));
            await secureWriter.WriteLineAsync("250-localhost");
            await secureWriter.WriteLineAsync("250-AUTH PLAIN");
            await secureWriter.WriteLineAsync("250 SIZE 100000");

            string authentication = Assert.IsType<string>(await secureReader.ReadLineAsync(_timeout.Token));
            Assert.StartsWith("AUTH PLAIN", authentication);
            string encodedCredentials = authentication["AUTH PLAIN".Length..].Trim();
            if (encodedCredentials.Length == 0)
            {
                await secureWriter.WriteLineAsync("334 ");
                encodedCredentials = Assert.IsType<string>(await secureReader.ReadLineAsync(_timeout.Token));
            }

            Assert.Equal(
                "\0smtp-user\0test-password",
                Encoding.UTF8.GetString(Convert.FromBase64String(encodedCredentials)));
            await secureWriter.WriteLineAsync("235 Authenticated");

            string sender = Assert.IsType<string>(await secureReader.ReadLineAsync(_timeout.Token));
            Assert.StartsWith("MAIL FROM:", sender);
            Assert.Contains("no-reply@example.test", sender);
            await secureWriter.WriteLineAsync("250 OK");
            string recipient = Assert.IsType<string>(await secureReader.ReadLineAsync(_timeout.Token));
            Assert.StartsWith("RCPT TO:", recipient);
            Assert.Contains("registered@example.test", recipient);
            await secureWriter.WriteLineAsync("250 OK");
            Assert.Equal("DATA", await secureReader.ReadLineAsync(_timeout.Token));
            await secureWriter.WriteLineAsync("354 Enter message");

            StringBuilder rawMessage = new();
            while (true)
            {
                string line = Assert.IsType<string>(await secureReader.ReadLineAsync(_timeout.Token));
                if (line == ".")
                {
                    break;
                }

                rawMessage.Append(line.StartsWith("..", StringComparison.Ordinal) ? line[1..] : line)
                    .Append("\r\n");
            }

            await secureWriter.WriteLineAsync("250 Queued");
            Assert.Equal("QUIT", await secureReader.ReadLineAsync(_timeout.Token));
            await secureWriter.WriteLineAsync("221 Bye");

            using MemoryStream messageStream = new(Encoding.UTF8.GetBytes(rawMessage.ToString()));
            return MimeMessage.Load(messageStream);
        }

        private static StreamReader CreateReader(Stream stream) =>
            new(stream, Encoding.ASCII, false, 1024, leaveOpen: true);

        private static StreamWriter CreateWriter(Stream stream) =>
            new(stream, Encoding.ASCII, 1024, leaveOpen: true)
            {
                AutoFlush = true,
                NewLine = "\r\n"
            };
    }
}
