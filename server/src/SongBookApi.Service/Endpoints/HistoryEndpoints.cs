using System.Security.Claims;
using SongBookApi.Domain.Services;
using SongBookApi.Service.Authentication;

namespace SongBookApi.Service.Endpoints;

public static class HistoryEndpoints
{
    public sealed record RestoreRequest(long? ExpectedRevision);

    public static void MapHistoryEndpoints(this WebApplication app)
    {
        var books = app.MapGroup("/songbooks/{bookId:guid}")
            .RequireAuthorization(AuthConstants.AuthenticatedUserPolicy)
            .AddEndpointFilter<MutationAttributionFilter>();
        books.MapGet("/history", BookHistory);
        books.MapGet("/songs/{songId:guid}/history", SongHistory);
        books.MapGet("/songs/{songId:guid}/history/{revision:long}", Snapshot);
        books.MapPost("/songs/{songId:guid}/history/{revision:long}/restore", Restore)
            .AddEndpointFilter<AntiforgeryValidationFilter>();
    }

    private static async Task<IResult?> Denial(Guid bookId, ClaimsPrincipal principal,
        ISongBookAccessService access, EffectiveSongBookAccess minimum)
    {
        var level = await access.GetAccessAsync(bookId, EndpointHelpers.GetUserId(principal));
        return level == EffectiveSongBookAccess.None ? Results.NotFound() :
            level < minimum ? Results.Forbid() : null;
    }

    private static async Task<IResult> BookHistory(Guid bookId, ClaimsPrincipal principal,
        ISongBookAccessService access, IHistoryRepository history, int page = 1)
    {
        var denial = await Denial(bookId, principal, access, EffectiveSongBookAccess.Reader);
        if (denial is not null) return denial;
        var invalid = EndpointHelpers.ValidatePage(page);
        if (invalid is not null) return invalid;
        var level = await access.GetAccessAsync(bookId, EndpointHelpers.GetUserId(principal));
        return Results.Ok(await history.GetBookHistoryAsync(bookId, level == EffectiveSongBookAccess.Admin, page));
    }

    private static async Task<IResult> SongHistory(Guid bookId, Guid songId, ClaimsPrincipal principal,
        ISongBookAccessService access, IHistoryRepository history, int page = 1)
    {
        var denial = await Denial(bookId, principal, access, EffectiveSongBookAccess.Reader);
        if (denial is not null) return denial;
        var invalid = EndpointHelpers.ValidatePage(page);
        if (invalid is not null) return invalid;
        var result = await history.GetSongHistoryAsync(bookId, songId, page);
        return result is null ? Results.NotFound() : Results.Ok(result);
    }

    private static async Task<IResult> Snapshot(Guid bookId, Guid songId, long revision, ClaimsPrincipal principal,
        ISongBookAccessService access, IHistoryRepository history)
    {
        var denial = await Denial(bookId, principal, access, EffectiveSongBookAccess.Reader);
        if (denial is not null) return denial;
        if (revision < 1) return Results.BadRequest();
        try
        {
            var result = await history.GetSnapshotAsync(bookId, songId, revision);
            return result is null ? Results.NotFound() : Results.Ok(result);
        }
        catch (SongRevisionConflictException exception) { return Results.Conflict(new { message = exception.Message }); }
    }

    private static async Task<IResult> Restore(Guid bookId, Guid songId, long revision, RestoreRequest request,
        ClaimsPrincipal principal, ISongBookAccessService access, IHistoryRepository history)
    {
        var denial = await Denial(bookId, principal, access, EffectiveSongBookAccess.Editor);
        if (denial is not null) return denial;
        if (revision < 1 || request.ExpectedRevision is null or < 1) return Results.BadRequest();
        try
        {
            var result = await history.RestoreAsync(bookId, songId, revision, request.ExpectedRevision.Value);
            return result is null ? Results.NotFound() : Results.Ok(new { result.Id, result.Revision });
        }
        catch (SongRevisionConflictException exception) { return Results.Conflict(new { message = exception.Message }); }
        catch (Microsoft.EntityFrameworkCore.DbUpdateConcurrencyException) { return Results.Conflict(); }
    }
}