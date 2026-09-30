using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.DataProtection;
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
        string connectionString = GetConnectionString(configuredConnectionString, environment);
        ValidateAllowedHosts(configuration["AllowedHosts"]);
        ModerationBootstrap.ValidateConfiguration(configuration);

        _ = services.AddDbContext<SongBookDbContext>(options => options.UseSqlite(connectionString));
        if (!environment.IsDevelopment())
        {
            string? keyDirectory = configuration["DataProtection:KeyDirectory"];
            if (string.IsNullOrWhiteSpace(keyDirectory) ||
                !Path.IsPathFullyQualified(keyDirectory) ||
                !Directory.Exists(keyDirectory))
            {
                throw new InvalidOperationException(
                    "DataProtection:KeyDirectory must be an existing absolute directory outside Development.");
            }

            _ = services.AddDataProtection()
                .SetApplicationName("SongBook")
                .PersistKeysToFileSystem(new DirectoryInfo(keyDirectory));
        }

        _ = services.AddSingleton(new AccountLinkBuilder(
            configuration["AccountLinks:PublicOrigin"] ?? string.Empty));
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
            options.Events.OnValidatePrincipal = async context =>
            {
                await SecurityStampValidator.ValidatePrincipalAsync(context);
                if (context.Principal?.Identity?.IsAuthenticated != true)
                {
                    return;
                }

                UserManager<ApplicationUser> userManager = context.HttpContext
                    .RequestServices.GetRequiredService<UserManager<ApplicationUser>>();
                ApplicationUser? user = await userManager.GetUserAsync(context.Principal);
                if (user is null || user.IsBanned)
                {
                    context.RejectPrincipal();
                    await context.HttpContext.SignOutAsync(IdentityConstants.ApplicationScheme);
                }
            };
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
        _ = services.Configure<SecurityStampValidatorOptions>(options =>
            options.ValidationInterval = TimeSpan.Zero);

        _ = services.AddAuthorizationBuilder()
            .AddPolicy(AuthConstants.AuthenticatedUserPolicy, policy =>
                policy.RequireAuthenticatedUser())
            .AddPolicy(AuthConstants.ModeratorPolicy, policy =>
                policy.RequireRole(AuthConstants.ModeratorRole, AuthConstants.SuperUserRole))
            .AddPolicy(AuthConstants.SuperUserPolicy, policy =>
                policy.RequireRole(AuthConstants.SuperUserRole));

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
            _ = services.AddSingleton<IAccountEmailSender>(new SmtpAccountEmailSender(configuration));
        }

        return services;
    }

    private static void ValidateAllowedHosts(string? configuredAllowedHosts)
    {
        string[] allowedHosts = (configuredAllowedHosts ?? string.Empty)
            .Split(';', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        if (allowedHosts.Length == 0 ||
            allowedHosts.Any(host => host is "*" or "0.0.0.0" or "[::]"))
        {
            throw new InvalidOperationException(
                "AllowedHosts must list the deployed host names and must not disable host filtering.");
        }
    }

    private static string GetConnectionString(
        string configuredConnectionString,
        IHostEnvironment environment)
    {
        SqliteConnectionStringBuilder builder = new(configuredConnectionString);
        if (!environment.IsDevelopment())
        {
            if (builder.DataSource is ":memory:" ||
                !Path.IsPathFullyQualified(builder.DataSource) ||
                !Directory.Exists(Path.GetDirectoryName(builder.DataSource)))
            {
                throw new InvalidOperationException(
                    "Production SQLite Data Source must be a file in an existing directory, using an absolute path.");
            }
        }
        else if (builder.DataSource is not ":memory:" && !Path.IsPathRooted(builder.DataSource))
        {
            builder.DataSource = Path.GetFullPath(builder.DataSource, environment.ContentRootPath);
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
