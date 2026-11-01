using System.Net;
using System.Net.Http.Json;
using SongBookApi.Domain;
using SongBookApi.Service.Contracts;

namespace SongBookApi.Service.Tests.Functional;

[Trait("Category", "Functional")]
public sealed class SongCrudFunctionalTests : IClassFixture<SongBookApiFactory>
{
    private readonly SongBookApiFactory _factory;

    public SongCrudFunctionalTests(SongBookApiFactory factory) => _factory = factory;

    [Fact]
    public async Task NestedCrudRoundTripsStablePartIdsAndOrder()
    {
        using HttpClient client = await AuthenticationTestHelpers.CreateConfirmedClientAsync(
            _factory,
            $"functional-{Guid.NewGuid():N}@example.test");
        SongBookResponse book = await CreateBookAsync(client);
        SongResponse song = await CreateSongAsync(client, book.Id);
        Guid verseId = song.Parts[0].Id;
        Guid chorusId = song.Parts[1].Id;

        using HttpResponseMessage update = await AuthenticationTestHelpers.PutJsonWithAntiforgeryAsync(
            client,
            $"/songbooks/{book.Id}/songs/{song.Id}",
            new
            {
                title = "Updated",
                parts = new object[]
                {
                    new { id = chorusId, name = "Chorus", text = "Updated chorus" },
                    new { id = verseId, name = "Verse", text = "Updated verse" },
                    new { name = "Bridge", text = "New" }
                }
            });
        Assert.Equal(HttpStatusCode.NoContent, update.StatusCode);

        SongResponse? changed = await client.GetFromJsonAsync<SongResponse>(
            $"/songbooks/{book.Id}/songs/{song.Id}");
        Assert.NotNull(changed);
        Assert.Equal(new[] { chorusId, verseId }, changed.Parts.Take(2).Select(part => part.Id));
        Assert.Equal(new[] { "Chorus", "Verse", "Bridge" }, changed.Parts.Select(part => part.Name));
        Assert.NotEqual(Guid.Empty, changed.Parts[2].Id);

        PageResult<SongSummaryResponse>? listed = await client.GetFromJsonAsync<PageResult<SongSummaryResponse>>(
            $"/songbooks/{book.Id}/songs");
        Assert.Contains(listed!.Items, candidate => candidate.Id == song.Id);

        using HttpResponseMessage delete = await AuthenticationTestHelpers.DeleteWithAntiforgeryAsync(
            client, $"/songbooks/{book.Id}/songs/{song.Id}");
        Assert.Equal(HttpStatusCode.NoContent, delete.StatusCode);
        Assert.Equal(
            HttpStatusCode.NotFound,
            (await client.GetAsync($"/songbooks/{book.Id}/songs/{song.Id}")).StatusCode);
    }

    [Fact]
    public async Task SongFieldLimitsAreEnforcedOnCreateAndUpdate()
    {
        using HttpClient client = await AuthenticationTestHelpers.CreateConfirmedClientAsync(
            _factory,
            $"limits-{Guid.NewGuid():N}@example.test");
        SongBookResponse book = await CreateBookAsync(client);
        SongResponse song = await CreateSongAsync(client, book.Id);
        string songsUrl = $"/songbooks/{book.Id}/songs";

        using HttpResponseMessage atLimit = await AuthenticationTestHelpers.PostJsonWithAntiforgeryAsync(
            client, songsUrl, new
            {
                title = new string('t', 200),
                author = new string('a', 200),
                originalTitle = new string('o', 200),
                number = new string('1', 32),
                key = new string('k', 32),
                tempo = new string('m', 32),
                parts = Enumerable.Range(0, 100)
                    .Select(_ => new { name = new string('n', 100), text = "x" })
                    .Prepend(new { name = "Long", text = new string('x', 10_000) })
                    .Take(100)
                    .ToArray()
            });
        Assert.Equal(HttpStatusCode.Created, atLimit.StatusCode);

        (object Body, string Path)[] invalid =
        [
            (new { title = new string('t', 201) }, "title"),
            (new { author = new string('a', 201) }, "author"),
            (new { originalTitle = new string('o', 201) }, "originalTitle"),
            (new { number = new string('1', 33) }, "number"),
            (new { key = new string('k', 33) }, "key"),
            (new { tempo = new string('m', 33) }, "tempo"),
            (new { parts = Enumerable.Range(0, 101).Select(_ => new { text = "x" }).ToArray() }, "parts"),
            (new { parts = new[] { new { text = "ok" }, new { text = new string('x', 10_001) } } }, "parts[1].text"),
            (new { parts = new[] { new { name = new string('n', 101), text = "ok" } } }, "parts[0].name"),
            (new
            {
                parts = new[]
                {
                    new
                    {
                        text = new string('x', 2_001),
                        chords = Enumerable.Range(0, 2_001).Select(offset => new { offset, symbol = "C" }).ToArray()
                    }
                }
            }, "parts[0].chords")
        ];

        foreach ((object body, string path) in invalid)
        {
            using HttpResponseMessage created =
                await AuthenticationTestHelpers.PostJsonWithAntiforgeryAsync(client, songsUrl, body);
            using HttpResponseMessage updated = await AuthenticationTestHelpers.PutJsonWithAntiforgeryAsync(
                client, $"{songsUrl}/{song.Id}", body);
            foreach (HttpResponseMessage response in new[] { created, updated })
            {
                Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
                using System.Text.Json.JsonDocument problem =
                    System.Text.Json.JsonDocument.Parse(await response.Content.ReadAsStringAsync());
                Assert.True(problem.RootElement.GetProperty("errors").TryGetProperty(path, out _), path);
            }
        }
    }

    [Fact]
    public async Task OversizedRequestBodiesAreRejected()
    {
        using HttpClient client = await AuthenticationTestHelpers.CreateConfirmedClientAsync(
            _factory,
            $"body-{Guid.NewGuid():N}@example.test");
        SongBookResponse book = await CreateBookAsync(client);
        using HttpRequestMessage request = new(HttpMethod.Post, $"/songbooks/{book.Id}/songs")
        {
            Content = JsonContent.Create(new { title = new string('x', 3 * 1024 * 1024) })
        };
        request.Headers.Add("X-CSRF-TOKEN", await AuthenticationTestHelpers.GetAntiforgeryTokenAsync(client));
        await request.Content.LoadIntoBufferAsync();

        using HttpResponseMessage response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.RequestEntityTooLarge, response.StatusCode);
    }

    private static async Task<SongBookResponse> CreateBookAsync(HttpClient client)
    {
        using HttpResponseMessage response =
            await AuthenticationTestHelpers.PostJsonWithAntiforgeryAsync(
                client, "/songbooks", new { name = "Functional" });
        return Assert.IsType<SongBookResponse>(
            await response.Content.ReadFromJsonAsync<SongBookResponse>());
    }

    private static async Task<SongResponse> CreateSongAsync(HttpClient client, Guid bookId)
    {
        using HttpResponseMessage response =
            await AuthenticationTestHelpers.PostJsonWithAntiforgeryAsync(
                client,
                $"/songbooks/{bookId}/songs",
                new
                {
                    title = "Original",
                    parts = new[]
                    {
                        new { name = "Verse", text = "Verse text" },
                        new { name = "Chorus", text = "Chorus text" }
                    }
                });
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return Assert.IsType<SongResponse>(
            await response.Content.ReadFromJsonAsync<SongResponse>());
    }
}
