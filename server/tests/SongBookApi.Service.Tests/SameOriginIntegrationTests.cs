using System.Net;

namespace SongBookApi.Service.Tests;

[Trait("Category", "Integration")]
public sealed class SameOriginIntegrationTests : IClassFixture<SongBookApiFactory>
{
    private readonly SongBookApiFactory _factory;

    public SameOriginIntegrationTests(SongBookApiFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task PrivateBookReads_DoNotEnableCorsForTheFormerDevelopmentOrigin()
    {
        using HttpClient client = _factory.CreateSecureClient();
        using HttpRequestMessage request = new(HttpMethod.Get, "/songbooks");
        request.Headers.Add("Origin", "http://localhost:3000");

        using HttpResponseMessage response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.False(response.Headers.Contains("Access-Control-Allow-Origin"));
    }
}
