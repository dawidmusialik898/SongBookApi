using SongBookApi.Domain;
using SongBookApi.Domain.Services;
using SongBookApi.Service.Authentication;
using SongBookApi.Service.Contracts;
using System.Security.Claims;
using DomainAdjacentSongs = SongBookApi.Domain.Dto.AdjacentSongs;
using DomainChord = SongBookApi.Domain.Dto.Chord;
using DomainPart = SongBookApi.Domain.Dto.Part;
using DomainSong = SongBookApi.Domain.Dto.Song;
using DomainSongSummary = SongBookApi.Domain.Dto.SongSummary;

namespace SongBookApi.Service.Endpoints;

public static class SongEndpoints
{
    internal const int MaxTitleLength = 200;
    internal const int MaxShortFieldLength = 32;
    internal const int MaxParts = 100;
    internal const int MaxPartNameLength = 100;
    internal const int MaxPartTextLength = 10_000;
    internal const int MaxChordsPerPart = 2_000;

    public static void MapSongEndpoints(this WebApplication app)
    {
        RouteGroupBuilder songs = app.MapGroup("/songbooks/{bookId:guid}/songs")
            .RequireAuthorization(AuthConstants.AuthenticatedUserPolicy)
            .AddEndpointFilter<MutationAttributionFilter>();

        songs.MapGet("", GetSongs);
        songs.MapGet("/{songId:guid}/adjacent", GetAdjacentSongs);
        songs.MapGet("/{songId:guid}", GetSong);
        songs.MapPost("", CreateSong).AddEndpointFilter<AntiforgeryValidationFilter>();
        songs.MapPost("/copy", CopySong).AddEndpointFilter<AntiforgeryValidationFilter>();
        songs.MapPut("/{songId:guid}", UpdateSong).AddEndpointFilter<AntiforgeryValidationFilter>();
        songs.MapDelete("/{songId:guid}", DeleteSong).AddEndpointFilter<AntiforgeryValidationFilter>();
    }

    private static async Task<IResult> GetSongs(
        Guid bookId,
        ClaimsPrincipal principal,
        ISongBookAccessService accessService,
        ISongService songService,
        int page = 1,
        string? search = null)
    {
        IResult? invalidPage = EndpointHelpers.ValidatePage(page);
        if (invalidPage is not null)
        {
            return invalidPage;
        }

        string trimmedSearch = search?.Trim() ?? string.Empty;
        if (trimmedSearch.Length > SongSearch.MaxLength)
        {
            return Results.ValidationProblem(
                new Dictionary<string, string[]>
                {
                    ["search"] = ["Search must contain at most 100 characters."]
                });
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

        PageResult<DomainSongSummary> songs = trimmedSearch.Length == 0
            ? await songService.GetSongsPageAsync(bookId, page)
            : await songService.SearchSongsPageAsync(bookId, trimmedSearch, page);
        return Results.Ok(new PageResult<SongSummaryResponse>(
            songs.Items.Select(ToSummaryResponse).ToArray(),
            songs.Page,
            songs.HasNext));
    }

    private static async Task<IResult> GetAdjacentSongs(
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

        DomainAdjacentSongs? adjacent = await songService.GetAdjacentSongsAsync(bookId, songId);
        return adjacent is null
            ? Results.NotFound()
            : Results.Ok(new AdjacentSongsResponse(
                adjacent.Previous is null ? null : ToSummaryResponse(adjacent.Previous),
                adjacent.Next is null ? null : ToSummaryResponse(adjacent.Next)));
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

        IResult? invalidRequest = ValidateSongLimits(request) ?? ValidateChords(request);
        if (invalidRequest is not null)
        {
            return invalidRequest;
        }

        DomainSong created = await songService.CreateSongAsync(bookId, ToDomain(request, acceptPartIds: false));
        return Results.Created(
            $"/songbooks/{bookId}/songs/{created.Id}",
            ToResponse(created));
    }

    private static async Task<IResult> CopySong(
        Guid bookId,
        CopySongRequest request,
        ClaimsPrincipal principal,
        ISongBookAccessService accessService,
        ISongService songService,
        IMutationContext mutation)
    {
        if (bookId == Guid.Empty || request.SourceBookId == Guid.Empty || request.SourceSongId == Guid.Empty)
        {
            return Results.ValidationProblem(new Dictionary<string, string[]>
            {
                ["sourceSongId"] = ["Source and destination IDs must be nonempty."]
            });
        }

        if (bookId == request.SourceBookId)
        {
            return Results.ValidationProblem(new Dictionary<string, string[]>
            {
                ["sourceBookId"] = ["Choose a different destination song book."]
            });
        }

        string userId = EndpointHelpers.GetUserId(principal);
        IResult? denial = await RequireAccessAsync(request.SourceBookId, userId, accessService, EffectiveSongBookAccess.Reader)
            ?? await RequireAccessAsync(bookId, userId, accessService, EffectiveSongBookAccess.Editor);
        if (denial is not null)
        {
            return denial;
        }

        DomainSong? source = await songService.GetSongByIdAsync(request.SourceBookId, request.SourceSongId);
        if (source is null)
        {
            return Results.NotFound();
        }

        DomainSong copy = new()
        {
            Title = source.Title,
            Author = source.Author,
            OriginalTitle = source.OriginalTitle,
            Number = source.Number,
            Key = source.Key,
            Tempo = source.Tempo,
            Parts = source.Parts.OrderBy(part => part.Position).Select(part => new DomainPart
            {
                Name = part.Name,
                Text = part.Text,
                Position = part.Position,
                Chords = part.Chords?.OrderBy(chord => chord.Offset).Select(chord => new DomainChord
                {
                    Offset = chord.Offset,
                    Symbol = chord.Symbol
                }).ToList() ?? []
            }).ToList()
        };
        MutationContext previous = mutation.Current;
        try
        {
            mutation.Current = previous with { Operation = "song.copied", ExpectedRevision = null, RestoredFromRevision = null };
            DomainSong created = await songService.CreateSongAsync(bookId, copy);
            return Results.Created($"/songbooks/{bookId}/songs/{created.Id}", ToResponse(created));
        }
        finally
        {
            mutation.Current = previous;
        }
    }

    private static async Task<IResult> UpdateSong(
        Guid bookId,
        Guid songId,
        SongRequest request,
        ClaimsPrincipal principal,
        ISongBookAccessService accessService,
        ISongService songService,
        IMutationContext mutation)
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

        IResult? invalidRequest = ValidateSongLimits(request) ?? ValidateChords(request);
        if (invalidRequest is not null)
        {
            return invalidRequest;
        }

        try
        {
            if (request.ExpectedRevision < 0) return Results.BadRequest();
            mutation.Current = mutation.Current with { ExpectedRevision = request.ExpectedRevision };
            return await songService.UpdateSongAsync(bookId, songId, ToDomain(request, acceptPartIds: true))
                ? Results.NoContent()
                : Results.NotFound();
        }
        catch (SongRevisionConflictException)
        {
            return Results.Conflict();
        }
        catch (Microsoft.EntityFrameworkCore.DbUpdateConcurrencyException)
        {
            return Results.Conflict();
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
        ISongService songService,
        IMutationContext mutation,
        long? expectedRevision = null)
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

        if (expectedRevision < 0) return Results.BadRequest();
        mutation.Current = mutation.Current with { ExpectedRevision = expectedRevision };
        try
        {
            return await songService.DeleteSongAsync(bookId, songId)
                ? Results.NoContent() : Results.NotFound();
        }
        catch (SongRevisionConflictException) { return Results.Conflict(); }
        catch (Microsoft.EntityFrameworkCore.DbUpdateConcurrencyException) { return Results.Conflict(); }
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

    private static IResult? ValidateSongLimits(SongRequest request)
    {
        Dictionary<string, string[]> errors = [];
        CheckLength(errors, "title", request.Title, MaxTitleLength);
        CheckLength(errors, "originalTitle", request.OriginalTitle, MaxTitleLength);
        CheckLength(errors, "author", request.Author, MaxTitleLength);
        CheckLength(errors, "number", request.Number, MaxShortFieldLength);
        CheckLength(errors, "key", request.Key, MaxShortFieldLength);
        CheckLength(errors, "tempo", request.Tempo, MaxShortFieldLength);

        if (request.Parts is { Count: > MaxParts })
        {
            errors["parts"] = [$"A song can have at most {MaxParts} parts."];
        }
        else if (request.Parts is not null)
        {
            for (int partIndex = 0; partIndex < request.Parts.Count; partIndex++)
            {
                PartRequest? part = request.Parts[partIndex];
                if (part is null)
                {
                    continue;
                }

                CheckLength(errors, $"parts[{partIndex}].name", part.Name, MaxPartNameLength);
                CheckLength(errors, $"parts[{partIndex}].text", part.Text, MaxPartTextLength);
                if (part.Chords is { Count: > MaxChordsPerPart })
                {
                    errors[$"parts[{partIndex}].chords"] =
                        [$"A part can have at most {MaxChordsPerPart} chords."];
                }
            }
        }

        return errors.Count == 0 ? null : Results.ValidationProblem(errors);

        static void CheckLength(Dictionary<string, string[]> errors, string path, string? value, int max)
        {
            if (value?.Length > max)
            {
                errors[path] = [$"Use {max} characters or fewer."];
            }
        }
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

    private static IResult ChordValidationError(string path, string message)
        => Results.ValidationProblem(new Dictionary<string, string[]> { [path] = [message] });

    private static DomainSong ToDomain(SongRequest request, bool acceptPartIds)
        => new()
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

    internal static SongResponse ToResponse(DomainSong song)
        => new(
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
                .ToList(),
            song.Revision);

    internal static SongSummaryResponse ToSummaryResponse(DomainSongSummary song)
        => new(song.Id, song.Title, song.Author, song.Number);
}