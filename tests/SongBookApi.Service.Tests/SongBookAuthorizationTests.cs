using System.Net;
using System.Net.Http.Json;
using SongBookApi.Service.Contracts;

namespace SongBookApi.Service.Tests;

[Trait("Category", "Integration")]
public sealed class SongBookAuthorizationTests : IClassFixture<TestApplicationFactory>
{
    private readonly TestApplicationFactory _factory;

    public SongBookAuthorizationTests(TestApplicationFactory factory) => _factory = factory;

    [Fact]
    public async Task ReaderEditorAndAdminPermissionMatrixIsEnforced()
    {
        string readerEmail = $"reader-matrix-{Guid.NewGuid():N}@example.test";
        string editorEmail = $"editor-matrix-{Guid.NewGuid():N}@example.test";
        using HttpClient owner = await CreateUserAsync("owner-matrix");
        using HttpClient reader = await AuthenticationTestHelpers.CreateConfirmedClientAsync(_factory, readerEmail);
        using HttpClient editor = await AuthenticationTestHelpers.CreateConfirmedClientAsync(_factory, editorEmail);
        SongBookResponse book = await SongBookTestHelpers.CreateBookAsync(owner, "Matrix");
        SongResponse original = await SongBookTestHelpers.CreateSongAsync(owner, book.Id, "Original");
        SongBookAccessResponse readerAccess =
            await SongBookTestHelpers.SetAccessAsync(owner, book.Id, readerEmail, "reader");
        _ = await SongBookTestHelpers.SetAccessAsync(owner, book.Id, editorEmail, "editor");

        Assert.Equal(HttpStatusCode.OK, (await reader.GetAsync($"/songbooks/{book.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await reader.GetAsync($"/songbooks/{book.Id}/songs")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await reader.GetAsync($"/songbooks/{book.Id}/songs/{original.Id}")).StatusCode);
        Assert.Equal(
            HttpStatusCode.Forbidden,
            (await AuthenticationTestHelpers.PostJsonWithAntiforgeryAsync(
                reader,
                $"/songbooks/{book.Id}/songs",
                new { title = "Reader denied", parts = Array.Empty<object>() })).StatusCode);
        Assert.Equal(
            HttpStatusCode.Forbidden,
            (await AuthenticationTestHelpers.PutJsonWithAntiforgeryAsync(
                reader,
                $"/songbooks/{book.Id}/songs/{original.Id}",
                new { title = "Reader denied", parts = Array.Empty<object>() })).StatusCode);
        Assert.Equal(
            HttpStatusCode.Forbidden,
            (await AuthenticationTestHelpers.DeleteWithAntiforgeryAsync(
                reader, $"/songbooks/{book.Id}/songs/{original.Id}")).StatusCode);
        Assert.Equal(
            HttpStatusCode.Forbidden,
            (await AuthenticationTestHelpers.PutJsonWithAntiforgeryAsync(
                reader, $"/songbooks/{book.Id}", new { name = "Reader denied" })).StatusCode);

        SongResponse editorSong = await SongBookTestHelpers.CreateSongAsync(editor, book.Id, "Editor creates");
        Assert.Equal(
            HttpStatusCode.NoContent,
            (await AuthenticationTestHelpers.PutJsonWithAntiforgeryAsync(
                editor,
                $"/songbooks/{book.Id}/songs/{editorSong.Id}",
                new { title = "Editor updates", parts = Array.Empty<object>() })).StatusCode);
        Assert.Equal(
            HttpStatusCode.NoContent,
            (await AuthenticationTestHelpers.DeleteWithAntiforgeryAsync(
                editor, $"/songbooks/{book.Id}/songs/{editorSong.Id}")).StatusCode);

        Assert.Equal(
            HttpStatusCode.Forbidden,
            (await AuthenticationTestHelpers.PutJsonWithAntiforgeryAsync(
                editor, $"/songbooks/{book.Id}", new { name = "Denied" })).StatusCode);
        Assert.Equal(
            HttpStatusCode.Forbidden,
            (await AuthenticationTestHelpers.DeleteWithAntiforgeryAsync(
                editor, $"/songbooks/{book.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await editor.GetAsync($"/songbooks/{book.Id}/access")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await reader.GetAsync($"/songbooks/{book.Id}/access")).StatusCode);
        Assert.Equal(
            HttpStatusCode.Forbidden,
            (await AuthenticationTestHelpers.PutJsonWithAntiforgeryAsync(
                editor,
                $"/songbooks/{book.Id}/access",
                new { email = readerEmail, accessLevel = "editor" })).StatusCode);
        Assert.Equal(
            HttpStatusCode.Forbidden,
            (await AuthenticationTestHelpers.DeleteWithAntiforgeryAsync(
                editor, $"/songbooks/{book.Id}/access/{readerAccess.Id}")).StatusCode);

        using HttpResponseMessage rename = await AuthenticationTestHelpers.PutJsonWithAntiforgeryAsync(
            owner, $"/songbooks/{book.Id}", new { name = "Renamed by admin" });
        Assert.Equal(HttpStatusCode.NoContent, rename.StatusCode);
        SongBookResponse? renamed = await owner.GetFromJsonAsync<SongBookResponse>($"/songbooks/{book.Id}");
        Assert.Equal("Renamed by admin", renamed?.Name);
    }

    private Task<HttpClient> CreateUserAsync(string prefix) =>
        AuthenticationTestHelpers.CreateConfirmedClientAsync(
            _factory,
            $"{prefix}-{Guid.NewGuid():N}@example.test");
}
