using System.Net;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using SongBookApi.Infrastructure.Identity;
using SongBookApi.Service.Extensions;

namespace SongBookApi.Service.Tests;

public sealed class ProductionHostingTests
{
    [Fact]
    public async Task ProductionServesPackagedAssetsWithoutExposingConfiguration()
    {
        using ProductionApplicationFactory factory = new();
        using HttpClient client = factory.CreateSecureClient();

        using HttpResponseMessage index = await client.GetAsync("/");
        using HttpResponseMessage module = await client.GetAsync("/src/main.js");
        using HttpResponseMessage style = await client.GetAsync("/styles/app.css");
        using HttpResponseMessage configuration = await client.GetAsync("/appsettings.json");

        Assert.Equal(HttpStatusCode.OK, index.StatusCode);
        Assert.Equal(HttpStatusCode.OK, module.StatusCode);
        Assert.Equal(HttpStatusCode.OK, style.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, configuration.StatusCode);
        Assert.Equal("no-store", index.Headers.CacheControl?.ToString());
        Assert.Equal("no-cache", module.Headers.CacheControl?.ToString());
        Assert.Equal("no-cache", style.Headers.CacheControl?.ToString());
        Assert.Contains("'self'", Assert.Single(index.Headers.GetValues("Content-Security-Policy")));
        Assert.Equal("nosniff", Assert.Single(index.Headers.GetValues("X-Content-Type-Options")));
        Assert.Equal("no-referrer", Assert.Single(index.Headers.GetValues("Referrer-Policy")));
        Assert.False(index.Headers.Contains("Strict-Transport-Security"));
    }

    [Fact]
    public async Task HstsCanBeEnabledAfterThePublicCertificateIsVerified()
    {
        using ProductionApplicationFactory factory = new(enableHsts: true);
        using HttpClient client = factory.CreateSecureClient();

        using HttpResponseMessage response = await client.GetAsync("/");

        Assert.Contains("max-age=2592000",
            Assert.Single(response.Headers.GetValues("Strict-Transport-Security")));
    }

    [Fact]
    public void DataProtectionKeysCanBeReadAcrossApplicationInstances()
    {
        using ProductionApplicationFactory factory = new();
        using HttpClient client = factory.CreateSecureClient();
        IDataProtector first = factory.Services.GetRequiredService<IDataProtectionProvider>()
            .CreateProtector("restart-test");
        string encrypted = first.Protect("persistent-cookie-data");

        ServiceCollection services = new();
        _ = services.AddDataProtection()
            .SetApplicationName("SongBook")
            .PersistKeysToFileSystem(new DirectoryInfo(factory.KeyDirectory));
        using ServiceProvider second = services.BuildServiceProvider();
        IDataProtector afterRestart = second.GetRequiredService<IDataProtectionProvider>()
            .CreateProtector("restart-test");

        Assert.Equal("persistent-cookie-data", afterRestart.Unprotect(encrypted));
    }

    [Fact]
    public async Task HealthRequiresMigrationAndRecentOffHostBackup()
    {
        using ProductionApplicationFactory factory = new();
        using HttpClient client = factory.CreateSecureClient();

        using HttpResponseMessage missingDatabase = await client.GetAsync("/health");
        Assert.Equal(HttpStatusCode.ServiceUnavailable, missingDatabase.StatusCode);
        Assert.False(File.Exists(factory.DatabasePath));

        DbContextOptions<SongBookDbContext> options = new DbContextOptionsBuilder<SongBookDbContext>()
            .UseSqlite(new SqliteConnectionStringBuilder { DataSource = factory.DatabasePath }.ConnectionString)
            .Options;
        using (SongBookDbContext dbContext = new(options))
        {
            await dbContext.Database.MigrateAsync();
        }

        using HttpResponseMessage missingBackup = await client.GetAsync("/health");
        Assert.Equal(HttpStatusCode.ServiceUnavailable, missingBackup.StatusCode);

        File.WriteAllText(factory.BackupMarkerPath, "backup complete");
        using HttpResponseMessage healthy = await client.GetAsync("/health");
        Assert.Equal(HttpStatusCode.OK, healthy.StatusCode);

        File.SetLastWriteTimeUtc(factory.BackupMarkerPath, DateTime.UtcNow.AddHours(-23));
        using HttpResponseMessage withinRecoveryWindow = await client.GetAsync("/health");
        Assert.Equal(HttpStatusCode.OK, withinRecoveryWindow.StatusCode);

        File.SetLastWriteTimeUtc(factory.BackupMarkerPath, DateTime.UtcNow.AddHours(-25));
        using HttpResponseMessage staleBackup = await client.GetAsync("/health");
        Assert.Equal(HttpStatusCode.ServiceUnavailable, staleBackup.StatusCode);
    }

    [Theory]
    [InlineData("Data Source=:memory:")]
    [InlineData("Data Source=relative.db")]
    public void ProductionRejectsNonPersistentDatabase(string connectionString)
    {
        WebApplicationBuilder builder = WebApplication.CreateBuilder(new WebApplicationOptions
        {
            EnvironmentName = "Production"
        });
        builder.Configuration.AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["ConnectionStrings:SongBookConnection"] = connectionString
        });

        InvalidOperationException error = Assert.Throws<InvalidOperationException>(
            () => builder.Services.AddSongBookAuthentication(builder.Configuration, builder.Environment));

        Assert.Contains("absolute path", error.Message, StringComparison.Ordinal);
    }

    [Fact]
    public void ProductionRequiresPersistentDataProtectionKeys()
    {
        WebApplicationBuilder builder = WebApplication.CreateBuilder(new WebApplicationOptions
        {
            EnvironmentName = "Production"
        });
        builder.Configuration.AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["ConnectionStrings:SongBookConnection"] = new SqliteConnectionStringBuilder
            {
                DataSource = Path.Combine(Path.GetTempPath(), "songbook-keys-test.db")
            }.ConnectionString,
            ["AllowedHosts"] = "songbook.test"
        });

        InvalidOperationException error = Assert.Throws<InvalidOperationException>(
            () => builder.Services.AddSongBookAuthentication(builder.Configuration, builder.Environment));

        Assert.Contains("DataProtection:KeyDirectory", error.Message, StringComparison.Ordinal);
    }

    [Fact]
    public void SystemdCredentialFileSuppliesTheSmtpPassword()
    {
        DirectoryInfo directory = Directory.CreateTempSubdirectory("songbook-credential-");
        try
        {
            File.WriteAllText(Path.Combine(directory.FullName, "Email__Smtp__Password"),
                "test-app-password\n");
            IConfiguration configuration = new ConfigurationBuilder()
                .AddKeyPerFile(directory.FullName, optional: false)
                .Build();

            Assert.Equal("test-app-password", configuration["Email:Smtp:Password"]);
        }
        finally
        {
            directory.Delete(recursive: true);
        }
    }

    private sealed class ProductionApplicationFactory : WebApplicationFactory<Program>
    {
        private readonly DirectoryInfo _contentRoot = Directory.CreateTempSubdirectory("songbook-prod-");
        private readonly bool _enableHsts;

        public ProductionApplicationFactory(bool enableHsts = false)
        {
            _enableHsts = enableHsts;
            Directory.CreateDirectory(Path.Combine(_contentRoot.FullName, "keys"));
            Directory.CreateDirectory(Path.Combine(_contentRoot.FullName, "wwwroot", "src"));
            Directory.CreateDirectory(Path.Combine(_contentRoot.FullName, "wwwroot", "styles"));
            File.WriteAllText(Path.Combine(_contentRoot.FullName, "wwwroot", "index.html"),
                "<!doctype html><title>SongBook production test</title>");
            File.WriteAllText(Path.Combine(_contentRoot.FullName, "wwwroot", "src", "main.js"),
                "export const ready = true");
            File.WriteAllText(Path.Combine(_contentRoot.FullName, "wwwroot", "styles", "app.css"),
                "body { color: black; }");
        }

        public string DatabasePath => Path.Combine(_contentRoot.FullName, "songbook.db");
        public string BackupMarkerPath => Path.Combine(_contentRoot.FullName, "last-backup-success");
        public string KeyDirectory => Path.Combine(_contentRoot.FullName, "keys");

        public HttpClient CreateSecureClient() => CreateClient(new WebApplicationFactoryClientOptions
        {
            BaseAddress = new Uri("https://songbook.test/"),
            AllowAutoRedirect = false
        });

        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment("Production");
            builder.UseContentRoot(_contentRoot.FullName);
            Dictionary<string, string?> settings = new()
            {
                ["ConnectionStrings:SongBookConnection"] = new SqliteConnectionStringBuilder
                {
                    DataSource = DatabasePath
                }.ConnectionString,
                ["DataProtection:KeyDirectory"] = KeyDirectory,
                ["Backup:SuccessMarkerPath"] = BackupMarkerPath,
                ["Security:HstsEnabled"] = _enableHsts.ToString(),
                ["AllowedHosts"] = "songbook.test",
                ["AccountLinks:PublicOrigin"] = "https://songbook.test",
                ["Email:Smtp:Host"] = "smtp.example.test",
                ["Email:Smtp:Port"] = "587",
                ["Email:Smtp:UserName"] = "sender@example.test",
                ["Email:Smtp:Password"] = "test-credential",
                ["Email:Smtp:FromAddress"] = "sender@example.test"
            };
            foreach (KeyValuePair<string, string?> setting in settings)
            {
                builder.UseSetting(setting.Key, setting.Value!);
            }
        }

        protected override void Dispose(bool disposing)
        {
            base.Dispose(disposing);
            if (disposing && Directory.Exists(_contentRoot.FullName))
            {
                _contentRoot.Delete(recursive: true);
            }
        }
    }
}
