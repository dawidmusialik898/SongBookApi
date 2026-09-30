using System.Security.Claims;
using DomainSong = SongBookApi.Domain.Dto.Song;
using DomainPart = SongBookApi.Domain.Dto.Part;
using SongBookApi.Domain.Services;
using SongBookApi.Service.Authentication;
using SongBookApi.Service.Contracts;

namespace SongBookApi.Service.Endpoints;

public static class SongEndpoints
{
    public static void MapSongEndpoints(this WebApplication app)
    {
        RouteGroupBuilder songs = app.MapGroup("/songbooks/{bookId:guid}/songs")
            .RequireAuthorization(AuthConstants.AuthenticatedUserPolicy);

        songs.MapGet("", GetSongs);
        songs.MapGet("/{songId:guid}", GetSong);
        songs.MapPost("", CreateSong).AddEndpointFilter<AntiforgeryValidationFilter>();
        songs.MapPut("/{songId:guid}", UpdateSong).AddEndpointFilter<AntiforgeryValidationFilter>();
        songs.MapDelete("/{songId:guid}", DeleteSong).AddEndpointFilter<AntiforgeryValidationFilter>();
    }

    private static async Task<IResult> GetSongs(
        Guid bookId,
        ClaimsPrincipal principal,
        ISongBookAccessService accessService,
        ISongService songService)
    {
        IResult? denial = await RequireAccessAsync(
            bookId,
            EndpointHelpers.GetUserId(principal),
            accessService,
            EffectiveSongBookAccess.Reader);
        if (denial is not null)
        {
            return denial;
        }

        return Results.Ok((await songService.GetAllSongsAsync(bookId)).Select(ToResponse));
    }

    private static async Task<IResult> GetSong(
        Guid bookId,
        Guid songId,
        ClaimsPrincipal principal,
        ISongBookAccessService accessService,
        ISongService songService)
    {
        IResult? denial = await RequireAccessAsync(
            bookId,
            EndpointHelpers.GetUserId(principal),
            accessService,
            EffectiveSongBookAccess.Reader);
        if (denial is not null)
        {
            return denial;
        }

        DomainSong? song = await songService.GetSongByIdAsync(bookId, songId);
        return song is null ? Results.NotFound() : Results.Ok(ToResponse(song));
    }

    private static async Task<IResult> CreateSong(
        Guid bookId,
        SongRequest request,
        ClaimsPrincipal principal,
        ISongBookAccessService accessService,
        ISongService songService)
    {
        IResult? denial = await RequireAccessAsync(
            bookId,
            EndpointHelpers.GetUserId(principal),
            accessService,
            EffectiveSongBookAccess.Editor);
        if (denial is not null)
        {
            return denial;
        }
        if (request.Parts?.Any(part => part.Id.HasValue) == true)
        {
            return Results.ValidationProblem(
                new Dictionary<string, string[]>
                {
                    ["parts"] = ["Part IDs are accepted only when updating existing parts."]
                });
        }

        DomainSong created = await songService.CreateSongAsync(bookId, ToDomain(request, acceptPartIds: false));
        return Results.Created(
            $"/songbooks/{bookId}/songs/{created.Id}",
            ToResponse(created));
    }

    private static async Task<IResult> UpdateSong(
        Guid bookId,
        Guid songId,
        SongRequest request,
        ClaimsPrincipal principal,
        ISongBookAccessService accessService,
        ISongService songService)
    {
        IResult? denial = await RequireAccessAsync(
            bookId,
            EndpointHelpers.GetUserId(principal),
            accessService,
            EffectiveSongBookAccess.Editor);
        if (denial is not null)
        {
            return denial;
        }

        try
        {
            return await songService.UpdateSongAsync(bookId, songId, ToDomain(request, acceptPartIds: true))
                ? Results.NoContent()
                : Results.NotFound();
        }
        catch (ArgumentException exception)
        {
            return Results.ValidationProblem(
                new Dictionary<string, string[]> { ["parts"] = [exception.Message] });
        }
    }

    private static async Task<IResult> DeleteSong(
        Guid bookId,
        Guid songId,
        ClaimsPrincipal principal,
        ISongBookAccessService accessService,
        ISongService songService)
    {
        IResult? denial = await RequireAccessAsync(
            bookId,
            EndpointHelpers.GetUserId(principal),
            accessService,
            EffectiveSongBookAccess.Editor);
        if (denial is not null)
        {
            return denial;
        }

        return await songService.DeleteSongAsync(bookId, songId)
            ? Results.NoContent()
            : Results.NotFound();
    }

    private static async Task<IResult?> RequireAccessAsync(
        Guid bookId,
        string userId,
        ISongBookAccessService accessService,
        EffectiveSongBookAccess minimum)
    {
        EffectiveSongBookAccess access = await accessService.GetAccessAsync(bookId, userId);
        if (access == EffectiveSongBookAccess.None)
        {
            return Results.NotFound();
        }
        if (access < minimum)
        {
            return Results.Forbid();
        }
        return null;
    }

    private static DomainSong ToDomain(SongRequest request, bool acceptPartIds) =>
        new()
        {
            Title = request.Title,
            Author = request.Author,
            OriginalTitle = request.OriginalTitle,
            Number = request.Number,
            Key = request.Key,
            Tempo = request.Tempo,
            Parts = request.Parts?.Select(part => new DomainPart
            {
                Id = acceptPartIds ? part.Id ?? Guid.Empty : Guid.Empty,
                Name = part.Name,
                Text = part.Text
            }).ToList() ?? []
        };

    private static SongResponse ToResponse(DomainSong song) =>
        new(
            song.Id,
            song.Title,
            song.Author,
            song.OriginalTitle,
            song.Number,
            song.Key,
            song.Tempo,
            song.Parts
                .OrderBy(part => part.Position)
                .Select(part => new PartResponse(part.Id, part.Name, part.Text))
                .ToList());
}
