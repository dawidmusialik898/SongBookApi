using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SongBookApi.Infrastructure.Identity;
using SongBookApi.Service.Contracts;

namespace SongBookApi.Service.Tests.Functional;

[Trait("Category", "Functional")]
public sealed class ChordFunctionalTests : IClassFixture<SongBookApiFactory>
{
    private readonly SongBookApiFactory _factory;

    public ChordFunctionalTests(SongBookApiFactory factory) => _factory = factory;

    [Fact]
    public async Task ChordsRoundTripAcrossCreationReorderingUpdatesAndDeletion()
    {
        using HttpClient client = await AuthenticationTestHelpers.CreateConfirmedClientAsync(
            _factory, $"chords-{Guid.NewGuid():N}@example.test");
        SongBookResponse book = await SongBookTestHelpers.CreateBookAsync(client, "Chords");
        const string text = " A🎸m\nB";

        SongResponse song = await SongBookTestHelpers.CreateSongAsync(
            client,
            book.Id,
            parts:
            [
                new
                {
                    name = "Verse",
                    text,
                    chords = new[]
                    {
                        new { offset = 6, symbol = "F#" },
                        new { offset = 2, symbol = "Em7" },
                        new { offset = 0, symbol = " G " },
                        new { offset = 1, symbol = "D" }
                    }
                },
                new { name = "Chorus", text = "Next part" }
            ]);
        Guid verseId = song.Parts[0].Id;
        Guid chorusId = song.Parts[1].Id;
        Assert.Equal(text, song.Parts[0].Text);
        Assert.Equal(new[] { 0, 1, 2, 6 }, song.Parts[0].Chords.Select(chord => chord.Offset));
        Assert.Equal(new[] { "G", "D", "Em7", "F#" },
            song.Parts[0].Chords.Select(chord => chord.Symbol));
        Assert.Empty(song.Parts[1].Chords);

        SongResponse? read = await client.GetFromJsonAsync<SongResponse>(
            $"/songbooks/{book.Id}/songs/{song.Id}");
        Assert.Equal(song.Parts[0].Chords, read!.Parts[0].Chords);

        using HttpResponseMessage update = await AuthenticationTestHelpers.PutJsonWithAntiforgeryAsync(
            client, $"/songbooks/{book.Id}/songs/{song.Id}",
            new
            {
                title = "With chords",
                parts = new object[]
                {
                    new
                    {
                        id = chorusId, name = "Chorus", text = "Next part",
                        chords = new[] { new { offset = 4, symbol = "Am" } }
                    },
                    new
                    {
                        id = verseId, name = "Verse", text,
                        chords = new[]
                        {
                            new { offset = 0, symbol = "G7" },
                            new { offset = 6, symbol = "F#" }
                        }
                    }
                }
            });
        Assert.Equal(HttpStatusCode.NoContent, update.StatusCode);

        SongResponse? changed = await client.GetFromJsonAsync<SongResponse>(
            $"/songbooks/{book.Id}/songs/{song.Id}");
        Assert.Equal(new[] { chorusId, verseId }, changed!.Parts.Select(part => part.Id));
        Assert.Equal(new[] { "Am" }, changed.Parts[0].Chords.Select(chord => chord.Symbol));
        Assert.Equal(new[] { 0, 6 }, changed.Parts[1].Chords.Select(chord => chord.Offset));
        Assert.Equal(new[] { "G7", "F#" }, changed.Parts[1].Chords.Select(chord => chord.Symbol));

        using HttpResponseMessage removePart = await AuthenticationTestHelpers.PutJsonWithAntiforgeryAsync(
            client, $"/songbooks/{book.Id}/songs/{song.Id}",
            new { parts = new[] { new { id = chorusId, text = "Next part" } } });
        Assert.Equal(HttpStatusCode.NoContent, removePart.StatusCode);
        Assert.Equal(
            new[] { "Am" },
            (await client.GetFromJsonAsync<SongResponse>(
                $"/songbooks/{book.Id}/songs/{song.Id}"))!.Parts.Single().Chords
                .Select(chord => chord.Symbol));

        await using (AsyncServiceScope scope = _factory.Services.CreateAsyncScope())
        {
            SongBookDbContext db = scope.ServiceProvider.GetRequiredService<SongBookDbContext>();
            Assert.False(await db.Chords.AnyAsync(chord => chord.PartId == verseId));
        }

        using HttpResponseMessage delete = await AuthenticationTestHelpers.DeleteWithAntiforgeryAsync(
            client, $"/songbooks/{book.Id}/songs/{song.Id}");
        Assert.Equal(HttpStatusCode.NoContent, delete.StatusCode);
        await using (AsyncServiceScope scope = _factory.Services.CreateAsyncScope())
        {
            SongBookDbContext db = scope.ServiceProvider.GetRequiredService<SongBookDbContext>();
            Assert.False(await db.Chords.AnyAsync(chord => chord.PartId == chorusId));
        }
    }

    [Fact]
    public async Task InvalidChordsAreRejectedWithoutCreatingOrChangingSongs()
    {
        using HttpClient client = await AuthenticationTestHelpers.CreateConfirmedClientAsync(
            _factory, $"invalid-chords-{Guid.NewGuid():N}@example.test");
        SongBookResponse book = await SongBookTestHelpers.CreateBookAsync(client, "Invalid chords");
        const string lyrics = "A🎸\nB";
        (object[] Chords, string ErrorPath)[] cases =
        [
            ([new { offset = -1, symbol = "G" }], "parts[0].chords[0].offset"),
            ([new { offset = 5, symbol = "G" }], "parts[0].chords[0].offset"),
            ([new { offset = 3, symbol = "G" }], "parts[0].chords[0].offset"),
            ([new { offset = 2, symbol = "G" }], "parts[0].chords[0].offset"),
            ([new { symbol = "G" }], "parts[0].chords[0].offset"),
            ([new { offset = 0, symbol = " " }], "parts[0].chords[0].symbol"),
            ([new { offset = 0, symbol = new string('X', 65) }],
                "parts[0].chords[0].symbol"),
            ([new { offset = 0, symbol = "G" }, new { offset = 0, symbol = "C" }],
                "parts[0].chords[1].offset"),
            ([null!], "parts[0].chords[0]")
        ];

        foreach ((object[] chords, string errorPath) in cases)
        {
            using HttpResponseMessage invalid = await AuthenticationTestHelpers.PostJsonWithAntiforgeryAsync(
                client, $"/songbooks/{book.Id}/songs",
                new { parts = new[] { new { text = lyrics, chords } } });
            Assert.Equal(HttpStatusCode.BadRequest, invalid.StatusCode);
            JsonElement problem = await invalid.Content.ReadFromJsonAsync<JsonElement>();
            Assert.True(problem.GetProperty("errors").TryGetProperty(errorPath, out _),
                $"Expected a validation error for {errorPath}.");
        }

        using HttpResponseMessage nullPart = await AuthenticationTestHelpers.PostJsonWithAntiforgeryAsync(
            client, $"/songbooks/{book.Id}/songs",
            new { parts = new object?[] { null } });
        Assert.Equal(HttpStatusCode.BadRequest, nullPart.StatusCode);

        SongResponse song = await SongBookTestHelpers.CreateSongAsync(
            client, book.Id, parts: [new { text = lyrics }]);
        using HttpResponseMessage invalidUpdate = await AuthenticationTestHelpers.PutJsonWithAntiforgeryAsync(
            client, $"/songbooks/{book.Id}/songs/{song.Id}",
            new
            {
                parts = new[]
                {
                    new
                    {
                        id = song.Parts[0].Id, text = lyrics,
                        chords = new[] { new { offset = 3, symbol = "G" } }
                    }
                }
            });
        Assert.Equal(HttpStatusCode.BadRequest, invalidUpdate.StatusCode);
        Assert.Empty((await client.GetFromJsonAsync<SongResponse>(
            $"/songbooks/{book.Id}/songs/{song.Id}"))!.Parts[0].Chords);
    }

    [Fact]
    public async Task OmittingChordsPreservesThemUnlessTheAnchoredLyricsChange()
    {
        using HttpClient client = await AuthenticationTestHelpers.CreateConfirmedClientAsync(
            _factory, $"existing-chords-{Guid.NewGuid():N}@example.test");
        SongBookResponse book = await SongBookTestHelpers.CreateBookAsync(client, "Existing chords");
        SongResponse song = await SongBookTestHelpers.CreateSongAsync(
            client,
            book.Id,
            parts: [new
            {
                text = "A B",
                chords = new[] { new { offset = 1, symbol = "C" } }
            }]);
        string url = $"/songbooks/{book.Id}/songs/{song.Id}";

        using HttpResponseMessage titleOnly = await AuthenticationTestHelpers.PutJsonWithAntiforgeryAsync(
            client, url,
            new { title = "Renamed", parts = new[] { new { id = song.Parts[0].Id, text = "A B" } } });
        Assert.Equal(HttpStatusCode.NoContent, titleOnly.StatusCode);
        Assert.Equal("C", (await client.GetFromJsonAsync<SongResponse>(url))!.Parts[0].Chords.Single().Symbol);

        using HttpResponseMessage missingChords = await AuthenticationTestHelpers.PutJsonWithAntiforgeryAsync(
            client, url,
            new { title = "Not saved", parts = new[] { new { id = song.Parts[0].Id, text = "ABC" } } });
        Assert.Equal(HttpStatusCode.BadRequest, missingChords.StatusCode);
        SongResponse? unchanged = await client.GetFromJsonAsync<SongResponse>(url);
        Assert.Equal("Renamed", unchanged!.Title);
        Assert.Equal("A B", unchanged.Parts[0].Text);
        Assert.Equal("C", unchanged.Parts[0].Chords.Single().Symbol);

        using HttpResponseMessage cleared = await AuthenticationTestHelpers.PutJsonWithAntiforgeryAsync(
            client, url,
            new
            {
                parts = new[]
                {
                    new
                    {
                        id = song.Parts[0].Id, text = "ABC",
                        chords = Array.Empty<object>()
                    }
                }
            });
        Assert.Equal(HttpStatusCode.NoContent, cleared.StatusCode);
        Assert.Empty((await client.GetFromJsonAsync<SongResponse>(url))!.Parts[0].Chords);
    }
}
