using System.Security.Claims;
using SongBookApi.Domain;
using SongBookApi.Domain.Services;

namespace SongBookApi.Service.Endpoints;

internal static class EndpointHelpers
{
    public static string GetUserId(ClaimsPrincipal principal) =>
        principal.FindFirstValue(ClaimTypes.NameIdentifier)
        ?? throw new InvalidOperationException("The authenticated user has no identifier.");

    public static string ToContract(this EffectiveSongBookAccess access) =>
        access.ToString().ToLowerInvariant();

    public static IResult? ValidatePage(int page) =>
        Paging.IsValid(page)
            ? null
            : Results.ValidationProblem(new Dictionary<string, string[]>
            {
                ["page"] = ["Page must be a positive number within the supported range."]
            });
}
