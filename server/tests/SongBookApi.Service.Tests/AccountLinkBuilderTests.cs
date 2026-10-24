using SongBookApi.Service.Authentication;

namespace SongBookApi.Service.Tests;

public sealed class AccountLinkBuilderTests
{
    [Theory]
    [InlineData("")]
    [InlineData("http://songbook.test")]
    [InlineData("https://user@songbook.test")]
    [InlineData("https://songbook.test/path")]
    [InlineData("https://songbook.test?query=value")]
    [InlineData("https://songbook.test#fragment")]
    public void Constructor_RejectsUnsafePublicOrigins(string publicOrigin)
    {
        Assert.Throws<InvalidOperationException>(() => new AccountLinkBuilder(publicOrigin));
    }

    [Fact]
    public void BuildLink_UsesConfiguredOrigin()
    {
        AccountLinkBuilder builder = new(TestApplicationFactory.AccountLinkOrigin);

        string link = builder.BuildLink("/auth/confirm-email", new Dictionary<string, string?>
        {
            ["userId"] = "user-id",
            ["code"] = "secret"
        });

        Uri uri = new(link);
        Assert.Equal(TestApplicationFactory.AccountLinkOrigin, uri.GetLeftPart(UriPartial.Authority));
        Assert.Equal("/auth/confirm-email", uri.AbsolutePath);
    }
}
