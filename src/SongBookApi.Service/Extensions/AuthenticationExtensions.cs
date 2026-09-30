using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Identity;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using SongBookApi.Infrastructure.Identity;
using SongBookApi.Service.Authentication;

namespace SongBookApi.Service.Extensions;

public static class AuthenticationExtensions
{
    public static IServiceCollection AddSongBookAuthentication(
        this IServiceCollection services,
        IConfiguration configuration,
        IHostEnvironment environment)
    {
        string configuredConnectionString = configuration.GetConnectionString("SongBookConnection")
            ?? throw new InvalidOperationException("Connection string 'SongBookConnection' is required.");
        string connectionString = GetConnectionString(configuredConnectionString, environment.ContentRootPath);

        _ = services.AddDbContext<SongBookDbContext>(options => options.UseSqlite(connectionString));
        _ = services
            .AddIdentity<ApplicationUser, IdentityRole>(options =>
            {
                options.User.RequireUniqueEmail = true;
                options.SignIn.RequireConfirmedEmail = true;
                options.Password.RequiredLength = 12;
                options.Password.RequireUppercase = false;
                options.Password.RequireLowercase = false;
                options.Password.RequireDigit = false;
                options.Password.RequireNonAlphanumeric = false;
                options.Lockout.AllowedForNewUsers = true;
                options.Lockout.MaxFailedAccessAttempts = 5;
                options.Lockout.DefaultLockoutTimeSpan = TimeSpan.FromMinutes(15);
            })
            .AddEntityFrameworkStores<SongBookDbContext>()
            .AddDefaultTokenProviders();

        _ = services.ConfigureApplicationCookie(options =>
        {
            options.Cookie.Name = "__Host-SongBook.Auth";
            options.Cookie.HttpOnly = true;
            options.Cookie.SecurePolicy = CookieSecurePolicy.Always;
            options.Cookie.SameSite = SameSiteMode.Lax;
            options.Cookie.Path = "/";
            options.Cookie.Domain = null;
            options.SlidingExpiration = true;
            options.ExpireTimeSpan = TimeSpan.FromHours(8);
            options.Events.OnRedirectToLogin = context =>
            {
                context.Response.StatusCode = StatusCodes.Status401Unauthorized;
                return Task.CompletedTask;
            };
            options.Events.OnRedirectToAccessDenied = context =>
            {
                context.Response.StatusCode = StatusCodes.Status403Forbidden;
                return Task.CompletedTask;
            };
        });

        _ = services.AddAuthorizationBuilder()
            .AddPolicy(AuthConstants.AuthenticatedUserPolicy, policy =>
                policy.RequireAuthenticatedUser());

        _ = services.AddAntiforgery(options =>
        {
            options.HeaderName = AuthConstants.AntiforgeryHeaderName;
            options.Cookie.Name = "__Host-SongBook.Antiforgery";
            options.Cookie.SecurePolicy = CookieSecurePolicy.Always;
            options.Cookie.SameSite = SameSiteMode.Lax;
            options.Cookie.Path = "/";
            options.Cookie.HttpOnly = true;
        });

        _ = services.AddRateLimiter(options =>
        {
            options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
            options.AddPolicy("login", context => CreateLimiter(context, 10, TimeSpan.FromMinutes(1)));
            options.AddPolicy("email", context => CreateLimiter(context, 5, TimeSpan.FromMinutes(15)));
        });

        if (environment.IsDevelopment())
        {
            _ = services.AddSingleton<IAccountEmailSender, DevelopmentAccountEmailSender>();
        }
        else
        {
            throw new InvalidOperationException(
                "A production IAccountEmailSender must be configured before running outside Development.");
        }

        return services;
    }

    private static string GetConnectionString(string configuredConnectionString, string contentRootPath)
    {
        SqliteConnectionStringBuilder builder = new(configuredConnectionString);
        if (builder.DataSource is not ":memory:" && !Path.IsPathRooted(builder.DataSource))
        {
            builder.DataSource = Path.GetFullPath(builder.DataSource, contentRootPath);
            Directory.CreateDirectory(Path.GetDirectoryName(builder.DataSource)!);
        }

        return builder.ConnectionString;
    }

    private static RateLimitPartition<string> CreateLimiter(
        HttpContext context,
        int permitLimit,
        TimeSpan window)
    {
        string remoteIp = context.Connection.RemoteIpAddress?.ToString() ?? context.TraceIdentifier;
        return RateLimitPartition.GetFixedWindowLimiter(
            remoteIp,
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = permitLimit,
                Window = window,
                QueueLimit = 0,
                AutoReplenishment = true
            });
    }
}
