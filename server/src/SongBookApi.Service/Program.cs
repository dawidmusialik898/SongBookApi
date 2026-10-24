using System.Net;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.FileProviders;
using SongBookApi.Infrastructure.Identity;
using SongBookApi.Service.Authentication;
using SongBookApi.Service.Endpoints;
using SongBookApi.Service.Extensions;

bool migrateOnly = args.Length == 1 && args[0] == "--migrate";
if (!migrateOnly && args.Contains("--migrate", StringComparer.Ordinal))
{
    throw new ArgumentException("--migrate must be used without other arguments.");
}

WebApplicationBuilder builder = WebApplication.CreateBuilder(migrateOnly ? [] : args);

if (!builder.Environment.IsDevelopment() &&
    Environment.GetEnvironmentVariable("CREDENTIALS_DIRECTORY") is { } credentialsDirectory)
{
    builder.Configuration.AddKeyPerFile(credentialsDirectory, optional: false);
}

builder.Services.AddOpenApi();
builder.Services.AddProblemDetails();
builder.Services.AddApplicationServices();
builder.Services.AddSongBookAuthentication(builder.Configuration, builder.Environment);
if (!builder.Environment.IsDevelopment())
{
    builder.Services.AddHsts(options => options.MaxAge = TimeSpan.FromDays(30));
}

WebApplication app = builder.Build();
string? backupMarker = null;
if (!app.Environment.IsDevelopment())
{
    backupMarker = app.Configuration["Backup:SuccessMarkerPath"];
    if (string.IsNullOrWhiteSpace(backupMarker) || !Path.IsPathFullyQualified(backupMarker))
    {
        throw new InvalidOperationException(
            "Backup:SuccessMarkerPath must be an absolute path outside Development.");
    }
}

if (app.Environment.IsDevelopment() || migrateOnly)
{
    using IServiceScope scope = app.Services.CreateScope();
    SongBookDbContext dbContext = scope.ServiceProvider.GetRequiredService<SongBookDbContext>();
    await dbContext.Database.MigrateAsync();
}

if (!string.IsNullOrWhiteSpace(app.Configuration[ModerationBootstrap.EmailSetting]))
{
    using IServiceScope scope = app.Services.CreateScope();
    await ModerationBootstrap.PromoteConfirmedUserAsync(
        app.Configuration,
        scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>());
}

if (migrateOnly)
{
    return;
}

if (!app.Environment.IsDevelopment())
{
    app.UseForwardedHeaders(new ForwardedHeadersOptions
    {
        ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto,
        ForwardLimit = 1,
        KnownProxies = { IPAddress.Loopback, IPAddress.IPv6Loopback }
    });
    app.UseExceptionHandler();
    if (app.Configuration.GetValue<bool>("Security:HstsEnabled"))
    {
        app.UseHsts();
    }

    app.Use(async (context, next) =>
    {
        context.Response.OnStarting(() =>
        {
            IHeaderDictionary headers = context.Response.Headers;
            headers["Content-Security-Policy"] =
                "default-src 'self'; base-uri 'none'; connect-src 'self'; form-action 'self'; " +
                "frame-ancestors 'none'; object-src 'none'; script-src 'self'; style-src 'self'";
            headers["X-Content-Type-Options"] = "nosniff";
            headers["Referrer-Policy"] = "no-referrer";
            return Task.CompletedTask;
        });
        await next();
    });
}

app.UseHttpsRedirection();

string clientRoot;
if (app.Environment.IsDevelopment())
{
    _ = app.MapOpenApi();

    string configuredClientRoot = builder.Configuration["DevelopmentStaticFiles:ClientRoot"]
        ?? throw new InvalidOperationException(
            "DevelopmentStaticFiles:ClientRoot must identify the client directory.");
    clientRoot = Path.GetFullPath(configuredClientRoot, app.Environment.ContentRootPath);
}
else
{
    clientRoot = Path.Combine(app.Environment.ContentRootPath, "wwwroot");
}

string indexPath = Path.Combine(clientRoot, "index.html");
if (!File.Exists(indexPath) ||
    !Directory.Exists(Path.Combine(clientRoot, "src")) ||
    !Directory.Exists(Path.Combine(clientRoot, "styles")))
{
    throw new InvalidOperationException(
        $"The client root '{clientRoot}' must contain index.html, src/, and styles/.");
}

_ = app.UseStaticFiles(new StaticFileOptions
{
    FileProvider = new PhysicalFileProvider(Path.Combine(clientRoot, "src")),
    RequestPath = "/src",
    OnPrepareResponse = context => context.Context.Response.Headers.CacheControl = "no-cache"
});
_ = app.UseStaticFiles(new StaticFileOptions
{
    FileProvider = new PhysicalFileProvider(Path.Combine(clientRoot, "styles")),
    RequestPath = "/styles",
    OnPrepareResponse = context => context.Context.Response.Headers.CacheControl = "no-cache"
});
_ = app.MapGet("/", (HttpContext context) =>
{
    context.Response.Headers.CacheControl = "no-store";
    return Results.File(indexPath, "text/html; charset=utf-8");
});

app.UseRouting();
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();
_ = app.MapGet("/health", async (SongBookDbContext dbContext, CancellationToken cancellationToken) =>
{
    if (backupMarker is not null)
    {
        if (!File.Exists(backupMarker) ||
            !File.Exists(dbContext.Database.GetDbConnection().DataSource))
        {
            return Results.StatusCode(StatusCodes.Status503ServiceUnavailable);
        }

        TimeSpan backupAge = DateTime.UtcNow - File.GetLastWriteTimeUtc(backupMarker);
        if (backupAge < TimeSpan.Zero || backupAge > TimeSpan.FromHours(24))
        {
            return Results.StatusCode(StatusCodes.Status503ServiceUnavailable);
        }
    }

    if (!await dbContext.Database.CanConnectAsync(cancellationToken) ||
        (await dbContext.Database.GetPendingMigrationsAsync(cancellationToken)).Any())
    {
        return Results.StatusCode(StatusCodes.Status503ServiceUnavailable);
    }

    return Results.Ok();
});
app.MapAuthEndpoints();
app.MapModerationEndpoints();
app.MapSongBookEndpoints();
app.MapSongEndpoints();
app.MapSongBookPdfEndpoints();

app.Run();

public partial class Program
{
}