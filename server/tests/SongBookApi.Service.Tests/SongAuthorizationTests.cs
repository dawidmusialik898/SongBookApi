using System.Net;
using System.Net.Http.Json;
using System.Text;
using SongBookApi.Service.Contracts;

namespace SongBookApi.Service.Tests;

[Trait("Category", "Integration")]
public sealed class SongAuthorizationTests : IClassFixture<TestApplicationFactory>
{
    private readonly TestApplicationFactory _factory;

    public SongAuthorizationTests(TestApplicationFactory factory) => _factory = factory;

    [Fact]
    public async Task AnonymousPrivateRoutesReturnUnauthorized()
    {
        using HttpClient client = _factory.CreateSecureClient();
        Guid bookId = Guid.NewGuid();

        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/songbooks")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync($"/songbooks/{bookId}/songs")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync("/songs")).StatusCode);
    }

    [Fact]
    public async Task EveryBookAndSongMutationRequiresAntiforgery()
    {
        using HttpClient client = await AuthenticationTestHelpers.CreateConfirmedClientAsync(
            _factory,
            $"csrf-{Guid.NewGuid():N}@example.test");

        using HttpResponseMessage missingCreateBook =
            await client.PostAsJsonAsync("/songbooks", new { name = "Protected" });
        Assert.Equal(HttpStatusCode.BadRequest, missingCreateBook.StatusCode);

        using HttpResponseMessage createBook =
            await AuthenticationTestHelpers.PostJsonWithAntiforgeryAsync(
                client, "/songbooks", new { name = "Protected" });
        SongBookResponse book = Assert.IsType<SongBookResponse>(
            await createBook.Content.ReadFromJsonAsync<SongBookResponse>());

        using HttpResponseMessage missingCreateSong =
            await client.PostAsJsonAsync($"/songbooks/{book.Id}/songs", new
            {
                title = "Protected",
                parts = Array.Empty<object>()
            });
        using HttpResponseMessage missingRename =
            await client.PutAsJsonAsync($"/songbooks/{book.Id}", new { name = "Renamed" });
        using HttpResponseMessage missingDelete =
            await client.DeleteAsync($"/songbooks/{book.Id}");

        Assert.Equal(HttpStatusCode.BadRequest, missingCreateSong.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, missingRename.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, missingDelete.StatusCode);
    }

    [Fact]
    public async Task InvalidAntiforgeryTokenRejectsAuthenticatedMutation()
    {
        using HttpClient client = await AuthenticationTestHelpers.CreateConfirmedClientAsync(
            _factory,
            $"invalid-csrf-{Guid.NewGuid():N}@example.test");
        using HttpRequestMessage request = new(HttpMethod.Post, "/songbooks")
        {
            Content = new StringContent(
                """{"name":"Rejected"}""",
                Encoding.UTF8,
                "application/json")
        };
        request.Headers.Add("X-CSRF-TOKEN", "invalid-token");

        using HttpResponseMessage response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal(
            "application/problem+json",
            response.Content.Headers.ContentType?.MediaType);
    }
}
