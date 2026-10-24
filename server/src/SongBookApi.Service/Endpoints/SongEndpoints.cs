using System.Security.Claims;
using SongBookApi.Domain;
using DomainSongSummary = SongBookApi.Domain.Dto.SongSummary;
using DomainSong = SongBookApi.Domain.Dto.Song;
using DomainPart = SongBookApi.Domain.Dto.Part;
using DomainChord = SongBookApi.Domain.Dto.Chord;
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
        ISongService songService,
        int page = 1)
    {
        IResult? invalidPage = EndpointHelpers.ValidatePage(page);
        if (invalidPage is not null)
        {
            return invalidPage;
        }

        IResult? denial = await RequireAccessAsync(
            bookId,
            EndpointHelpers.GetUserId(principal),
            accessService,
            EffectiveSongBookAccess.Reader);
        if (denial is not null)
        {
            return denial;
        }

        PageResult<DomainSongSummary> songs = await songService.GetSongsPageAsync(bookId, page);
        return Results.Ok(new PageResult<SongSummaryResponse>(
            songs.Items.Select(song => new SongSummaryResponse(
                song.Id, song.Title, song.Author, song.Number)).ToArray(),
            songs.Page,
            songs.HasNext));
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
        if (request.Parts?.Any(part => part?.Id.HasValue == true) == true)
        {
            return Results.ValidationProblem(
                new Dictionary<string, string[]>
                {
                    ["parts"] = ["Part IDs are accepted only when updating existing parts."]
                });
        }

        IResult? invalidChords = ValidateChords(request);
        if (invalidChords is not null)
        {
            return invalidChords;
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

        IResult? invalidChords = ValidateChords(request);
        if (invalidChords is not null)
        {
            return invalidChords;
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

    private static IResult? ValidateChords(SongRequest request)
    {
        if (request.Parts is null)
        {
            return null;
        }

        for (int partIndex = 0; partIndex < request.Parts.Count; partIndex++)
        {
            PartRequest? part = request.Parts[partIndex];
            if (part is null)
            {
                return ChordValidationError($"parts[{partIndex}]", "A part cannot be null.");
            }

            HashSet<int> offsets = [];
            for (int chordIndex = 0; chordIndex < (part.Chords?.Count ?? 0); chordIndex++)
            {
                ChordRequest? chord = part.Chords![chordIndex];
                string path = $"parts[{partIndex}].chords[{chordIndex}]";
                if (chord is null)
                {
                    return ChordValidationError(path, "A chord cannot be null.");
                }

                int? offset = chord.Offset;
                string text = part.Text ?? string.Empty;
                if (offset is null || offset < 0 || offset >= text.Length ||
                    text[offset.Value] is '\r' or '\n' ||
                    char.IsLowSurrogate(text[offset.Value]) ||
                    (char.IsHighSurrogate(text[offset.Value]) &&
                        (offset.Value + 1 == text.Length || !char.IsLowSurrogate(text[offset.Value + 1]))))
                {
                    return ChordValidationError(
                        $"{path}.offset",
                        "The chord offset must point to a lyric character, not a line break or part of a surrogate pair.");
                }
                if (!offsets.Add(offset.Value))
                {
                    return ChordValidationError(
                        $"{path}.offset",
                        "Only one chord can be placed at each character.");
                }
                if (string.IsNullOrWhiteSpace(chord.Symbol) || chord.Symbol.Trim().Length > 64)
                {
                    return ChordValidationError(
                        $"{path}.symbol",
                        "A chord symbol must be nonblank and at most 64 characters.");
                }
            }
        }

        return null;
    }

    private static IResult ChordValidationError(string path, string message) =>
        Results.ValidationProblem(new Dictionary<string, string[]> { [path] = [message] });

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
                Text = part.Text,
                Chords = part.Chords?.Select(chord => new DomainChord
                {
                    Offset = chord.Offset!.Value,
                    Symbol = chord.Symbol!.Trim()
                }).ToList()
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
                .Select(part => new PartResponse(
                    part.Id,
                    part.Name,
                    part.Text,
                    part.Chords?
                        .OrderBy(chord => chord.Offset)
                        .Select(chord => new ChordResponse(chord.Offset, chord.Symbol))
                        .ToList() ?? []))
                .ToList());
}
