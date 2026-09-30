using System.Net.Http.Json;
using SongBookApi.Service.Contracts;

namespace SongBookApi.Service.Tests;

internal static class AuthenticationTestHelpers
{
    public const string Password = "a password with twelve characters";

    public static async Task<string> GetAntiforgeryTokenAsync(HttpClient client)
    {
        AntiforgeryTokenResponse? response =
            await client.GetFromJsonAsync<AntiforgeryTokenResponse>("/auth/antiforgery");
        return Assert.IsType<string>(response?.Token);
    }

    public static async Task<HttpResponseMessage> PostJsonWithAntiforgeryAsync(
        HttpClient client,
        string path,
        object body)
    {
        HttpRequestMessage request = new(HttpMethod.Post, path)
        {
            Content = JsonContent.Create(body)
        };
        request.Headers.Add("X-CSRF-TOKEN", await GetAntiforgeryTokenAsync(client));
        return await client.SendAsync(request);
    }

    public static async Task<HttpResponseMessage> PutJsonWithAntiforgeryAsync(
        HttpClient client,
        string path,
        object body)
    {
        HttpRequestMessage request = new(HttpMethod.Put, path)
        {
            Content = JsonContent.Create(body)
        };
        request.Headers.Add("X-CSRF-TOKEN", await GetAntiforgeryTokenAsync(client));
        return await client.SendAsync(request);
    }

    public static async Task<HttpResponseMessage> DeleteWithAntiforgeryAsync(
        HttpClient client,
        string path)
    {
        HttpRequestMessage request = new(HttpMethod.Delete, path);
        request.Headers.Add("X-CSRF-TOKEN", await GetAntiforgeryTokenAsync(client));
        return await client.SendAsync(request);
    }

    public static async Task<HttpClient> CreateConfirmedClientAsync(
        TestApplicationFactory factory,
        string email)
    {
        HttpClient client = factory.CreateSecureClient();
        using (HttpResponseMessage registration = await PostJsonWithAntiforgeryAsync(
                   client,
                   "/auth/register",
                   new { email, password = Password }))
        {
            Assert.Equal(System.Net.HttpStatusCode.Accepted, registration.StatusCode);
        }

        Uri confirmationLink = new(factory.EmailSender.ConfirmationLinkFor(email));
        using (HttpResponseMessage confirmation = await client.GetAsync(
                   confirmationLink.PathAndQuery))
        {
            Assert.Equal(System.Net.HttpStatusCode.Found, confirmation.StatusCode);
        }

        using HttpResponseMessage login = await PostJsonWithAntiforgeryAsync(
            client,
            "/auth/login",
            new { email, password = Password, rememberMe = false });
        Assert.Equal(System.Net.HttpStatusCode.NoContent, login.StatusCode);
        return client;
    }
}
