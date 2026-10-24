using System.Net;
using System.Net.Http.Json;
using SongBookApi.Service.Contracts;

namespace SongBookApi.Service.Tests;

internal static class SongBookTestHelpers
{
    public static async Task<SongBookResponse> CreateBookAsync(HttpClient client, string name)
    {
        using HttpResponseMessage response =
            await AuthenticationTestHelpers.PostJsonWithAntiforgeryAsync(
                client, "/songbooks", new { name });
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return Assert.IsType<SongBookResponse>(
            await response.Content.ReadFromJsonAsync<SongBookResponse>());
    }

    public static Task<SongResponse> CreateSongAsync(
        HttpClient client,
        Guid bookId,
        string title = "Test song",
        object[]? parts = null)
        => CreateSongWithFieldsAsync(
            client,
            bookId,
            new
            {
                title,
                author = "Test author",
                parts = parts ?? []
            });

    public static async Task<SongResponse> CreateSongWithFieldsAsync(
        HttpClient client,
        Guid bookId,
        object body)
    {
        using HttpResponseMessage response =
            await AuthenticationTestHelpers.PostJsonWithAntiforgeryAsync(
                client,
                $"/songbooks/{bookId}/songs",
                body);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return Assert.IsType<SongResponse>(
            await response.Content.ReadFromJsonAsync<SongResponse>());
    }

    public static async Task<SongBookAccessResponse> SetAccessAsync(
        HttpClient owner,
        Guid bookId,
        string email,
        string accessLevel)
    {
        using HttpResponseMessage response =
            await AuthenticationTestHelpers.PutJsonWithAntiforgeryAsync(
                owner,
                $"/songbooks/{bookId}/access",
                new { email, accessLevel });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return Assert.IsType<SongBookAccessResponse>(
            await response.Content.ReadFromJsonAsync<SongBookAccessResponse>());
    }
}
