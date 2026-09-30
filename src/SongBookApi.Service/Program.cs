using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.FileProviders;
using SongBookApi.Infrastructure.Identity;
using SongBookApi.Service.Endpoints;
using SongBookApi.Service.Extensions;

WebApplicationBuilder builder = WebApplication.CreateBuilder(args);

builder.Services.AddOpenApi();
builder.Services.AddApplicationServices();
builder.Services.AddSongBookAuthentication(builder.Configuration, builder.Environment);
WebApplication app = builder.Build();

using (IServiceScope scope = app.Services.CreateScope())
{
    SongBookDbContext dbContext = scope.ServiceProvider.GetRequiredService<SongBookDbContext>();
    await dbContext.Database.MigrateAsync();
}

app.UseHttpsRedirection();

if (app.Environment.IsDevelopment())
{
    _ = app.MapOpenApi();

    string configuredClientRoot = builder.Configuration["DevelopmentStaticFiles:ClientRoot"]
        ?? throw new InvalidOperationException(
            "DevelopmentStaticFiles:ClientRoot must identify the sibling SongBookClient directory.");
    string clientRoot = Path.GetFullPath(configuredClientRoot, app.Environment.ContentRootPath);
    string indexPath = Path.Combine(clientRoot, "index.html");
    if (!Directory.Exists(clientRoot) || !File.Exists(indexPath))
    {
        throw new InvalidOperationException(
            $"The configured development client root '{clientRoot}' does not contain index.html.");
    }

    _ = app.UseStaticFiles(new StaticFileOptions
    {
        FileProvider = new PhysicalFileProvider(Path.Combine(clientRoot, "src")),
        RequestPath = "/src"
    });
    _ = app.UseStaticFiles(new StaticFileOptions
    {
        FileProvider = new PhysicalFileProvider(Path.Combine(clientRoot, "styles")),
        RequestPath = "/styles"
    });
    _ = app.MapGet("/", () => Results.File(indexPath, "text/html; charset=utf-8"));
}

app.UseRouting();
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();
app.MapAuthEndpoints();
app.MapSongBookEndpoints();
app.MapSongEndpoints();

app.Run();

public partial class Program
{
}