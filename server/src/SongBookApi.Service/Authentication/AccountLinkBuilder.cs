using Microsoft.AspNetCore.WebUtilities;

namespace SongBookApi.Service.Authentication;

public sealed class AccountLinkBuilder
{
    private readonly Uri _publicOrigin;

    public AccountLinkBuilder(string configuredPublicOrigin)
    {
        if (!Uri.TryCreate(configuredPublicOrigin, UriKind.Absolute, out Uri? publicOrigin) ||
            publicOrigin.Scheme != Uri.UriSchemeHttps ||
            !string.IsNullOrEmpty(publicOrigin.UserInfo) ||
            publicOrigin.AbsolutePath != "/" ||
            !string.IsNullOrEmpty(publicOrigin.Query) ||
            !string.IsNullOrEmpty(publicOrigin.Fragment))
        {
            throw new InvalidOperationException(
                "AccountLinks:PublicOrigin must be an absolute HTTPS origin without credentials, path, query, or fragment.");
        }

        _publicOrigin = publicOrigin;
    }

    public string BuildLink(string path, IDictionary<string, string?> query)
    {
        ArgumentException.ThrowIfNullOrEmpty(path);
        ArgumentNullException.ThrowIfNull(query);
        if (path[0] != '/' ||
            path.StartsWith("//", StringComparison.Ordinal) ||
            path.Contains('?') ||
            path.Contains('#'))
        {
            throw new ArgumentException("Account link paths must be absolute paths without a query or fragment.", nameof(path));
        }

        UriBuilder builder = new(_publicOrigin)
        {
            Path = path
        };
        return QueryHelpers.AddQueryString(builder.Uri.AbsoluteUri, query);
    }
}
