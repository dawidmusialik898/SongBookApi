using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

namespace SongBookApi.Service.Tests;

public sealed class MonorepoHostingTests
{
    [Fact]
    public void DevelopmentClientRootPointsToCheckedInAssets()
    {
        using TestApplicationFactory factory = new();
        string contentRoot = factory.Services.GetRequiredService<IHostEnvironment>().ContentRootPath;
        IConfiguration configuration = new ConfigurationBuilder()
            .AddJsonFile(Path.Combine(contentRoot, "appsettings.Development.json"))
            .Build();

        string configuredClientRoot = Assert.IsType<string>(
            configuration["DevelopmentStaticFiles:ClientRoot"]);
        string expectedClientRoot = Path.GetFullPath(
            Path.Combine(contentRoot, "../../..", "client"));

        Assert.Equal(expectedClientRoot, Path.GetFullPath(configuredClientRoot, contentRoot));
        Assert.True(File.Exists(Path.Combine(expectedClientRoot, "index.html")));
        Assert.True(File.Exists(Path.Combine(expectedClientRoot, "src", "main.js")));
        Assert.True(File.Exists(Path.Combine(expectedClientRoot, "src", "pagination.js")));
        Assert.True(File.Exists(Path.Combine(expectedClientRoot, "styles", "app.css")));
    }
}
