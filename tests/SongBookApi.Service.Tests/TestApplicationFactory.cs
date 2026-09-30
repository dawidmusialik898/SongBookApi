using System.Collections.Concurrent;
using System.Net;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using SongBookApi.Infrastructure.Identity;
using SongBookApi.Service.Authentication;

namespace SongBookApi.Service.Tests;

public class TestApplicationFactory : WebApplicationFactory<Program>
{
    private readonly SqliteConnection? _connection;
    private readonly string _connectionString;
    private readonly bool _useFixedRemoteIp;

    public TestApplicationFactory() : this(useFixedRemoteIp: false)
    {
    }

    internal TestApplicationFactory(bool useFixedRemoteIp)
    {
        _connection = new SqliteConnection("Data Source=:memory:");
        _connection.Open();
        _connectionString = _connection.ConnectionString;
        _useFixedRemoteIp = useFixedRemoteIp;
    }

    internal TestApplicationFactory(string databasePath)
    {
        _connectionString =
            new SqliteConnectionStringBuilder { DataSource = databasePath }
                .ConnectionString;
    }

    public FakeAccountEmailSender EmailSender { get; } = new();

    public HttpClient CreateSecureClient() => CreateClient(new WebApplicationFactoryClientOptions
    {
        BaseAddress = new Uri("https://localhost/"),
        HandleCookies = true,
        AllowAutoRedirect = false
    });

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Development");
        builder.ConfigureAppConfiguration(configuration =>
        {
            configuration.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["ConnectionStrings:SongBookConnection"] = _connectionString,
                ["DevelopmentStaticFiles:ClientRoot"] = "../../tests/SongBookApi.Service.Tests/Fixtures"
            });
        });
        builder.ConfigureServices(services =>
        {
            services.RemoveAll<DbContextOptions<SongBookDbContext>>();
            services.RemoveAll<SongBookDbContext>();
            services.AddDbContext<SongBookDbContext>(options =>
            {
                if (_connection is null)
                {
                    options.UseSqlite(_connectionString);
                }
                else
                {
                    options.UseSqlite(_connection);
                }
            });
            services.RemoveAll<IAccountEmailSender>();
            services.AddSingleton<IAccountEmailSender>(EmailSender);

            if (_useFixedRemoteIp)
            {
                services.AddSingleton<IStartupFilter, FixedRemoteIpStartupFilter>();
            }
        });
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            _connection?.Dispose();
        }

        base.Dispose(disposing);
    }
}

internal sealed class FixedRemoteIpStartupFilter : IStartupFilter
{
    public Action<IApplicationBuilder> Configure(Action<IApplicationBuilder> next) =>
        app =>
        {
            app.Use(async (context, continuation) =>
            {
                context.Connection.RemoteIpAddress = IPAddress.Loopback;
                await continuation();
            });
            next(app);
        };
}

public sealed class FakeAccountEmailSender : IAccountEmailSender
{
    private readonly ConcurrentDictionary<string, string> _confirmationLinks =
        new(StringComparer.OrdinalIgnoreCase);
    private readonly ConcurrentDictionary<string, string> _passwordResetLinks =
        new(StringComparer.OrdinalIgnoreCase);

    public Task SendConfirmationLinkAsync(string email, string link)
    {
        _confirmationLinks[email] = link;
        return Task.CompletedTask;
    }

    public Task SendPasswordResetLinkAsync(string email, string link)
    {
        _passwordResetLinks[email] = link;
        return Task.CompletedTask;
    }

    public string ConfirmationLinkFor(string email) => _confirmationLinks[email];
    public string PasswordResetLinkFor(string email) => _passwordResetLinks[email];
}
