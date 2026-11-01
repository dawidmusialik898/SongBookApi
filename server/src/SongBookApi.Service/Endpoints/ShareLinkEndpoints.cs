using Microsoft.Extensions.Primitives;
using SongBookApi.Domain;
using SongBookApi.Domain.Dto;
using SongBookApi.Domain.Services;
using SongBookApi.Service.Authentication;
using SongBookApi.Service.Contracts;

namespace SongBookApi.Service.Endpoints;

public static class ShareLinkEndpoints
{
    public static void MapShareLinkEndpoints(this WebApplication app)
    {
        RouteGroupBuilder management = app.MapGroup("/songbooks/{bookId:guid}/share-link")
            .RequireAuthorization(AuthConstants.AuthenticatedUserPolicy)
            .AddEndpointFilter<MutationAttributionFilter>()
            .AddEndpointFilter(async (context, next) =>
            {
                Guid bookId = (Guid)context.Arguments[0]!;
                ISongBookAccessService access = context.HttpContext.RequestServices.GetRequiredService<ISongBookAccessService>();
                EffectiveSongBookAccess level = await access.GetAccessAsync(
                    bookId, EndpointHelpers.GetUserId(context.HttpContext.User));
                return level switch
                {
                    EffectiveSongBookAccess.None => Results.NotFound(),
                    EffectiveSongBookAccess.Admin => await next(context),
                    _ => Results.Forbid()
                };
            });
        management.MapGet("", async (Guid bookId, IShareLinkService service) =>
            Results.Ok(await service.GetAsync(bookId)));
        management.MapPost("", async (Guid bookId, IShareLinkService service) =>
            Results.Ok(await service.ReplaceAsync(bookId)))
            .AddEndpointFilter<AntiforgeryValidationFilter>();
        management.MapDelete("", async (Guid bookId, IShareLinkService service) =>
        {
            await service.RevokeAsync(bookId);
            return Results.NoContent();
        }).AddEndpointFilter<AntiforgeryValidationFilter>();

        RouteGroupBuilder shared = app.MapGroup("/shared/songbooks/{bookId:guid}")
            .AllowAnonymous().RequireRateLimiting("shared-read")
            .AddEndpointFilter(async (context, next) =>
            {
                Guid bookId = (Guid)context.Arguments[0]!;
                IShareLinkService service = context.HttpContext.RequestServices.GetRequiredService<IShareLinkService>();
                StringValues header = context.HttpContext.Request.Headers["X-SongBook-Share-Token"];
                if (header.Count != 1 || !await service.ValidateAsync(bookId, header[0]))
                {
                    return Results.NotFound();
                }

                return await next(context);
            });
        shared.MapGet("", async (Guid bookId, IShareLinkService service) =>
        {
            SharedBook? book = await service.GetBookAsync(bookId);
            return book is null ? Results.NotFound() : Results.Ok(book);
        });
        shared.MapGet("/songs", GetSongs);
        shared.MapGet("/songs/{songId:guid}", async (Guid bookId, Guid songId, ISongService service) =>
        {
            Song? song = await service.GetSongByIdAsync(bookId, songId);
            if (song is null)
            {
                return Results.NotFound();
            }

            SongResponse response = SongEndpoints.ToResponse(song);
            return Results.Ok(new
            {
                response.Id,
                response.Title,
                response.Author,
                response.OriginalTitle,
                response.Number,
                response.Key,
                response.Tempo,
                response.Parts
            });
        });
        shared.MapGet("/songs/{songId:guid}/adjacent", async (Guid bookId, Guid songId, ISongService service) =>
        {
            AdjacentSongs? adjacent = await service.GetAdjacentSongsAsync(bookId, songId);
            return adjacent is null ? Results.NotFound() : Results.Ok(new AdjacentSongsResponse(
                adjacent.Previous is null ? null : SongEndpoints.ToSummaryResponse(adjacent.Previous),
                adjacent.Next is null ? null : SongEndpoints.ToSummaryResponse(adjacent.Next)));
        });
        shared.MapGet("/pdfs", async (Guid bookId, ISongBookPdfService service, HttpContext context) =>
        {
            IResult? invalid = ReadPage(context, out int page);
            return invalid ?? Results.Ok(await service.ListAsync(bookId, page));
        });
        shared.MapGet("/pdfs/{pdfId:guid}/download", async (Guid bookId, Guid pdfId, ISongBookPdfService service) =>
        {
            SongBookPdfDownload? pdf = await service.DownloadAsync(bookId, pdfId);
            string variant = pdf?.IncludeChords == true ? "chords" : "lyrics";
            return pdf is null ? Results.NotFound() : Results.File(pdf.Content, "application/pdf",
                $"songbook-{bookId:N}-{variant}-{pdfId:N}.pdf");
        });
    }

    private static async Task<IResult> GetSongs(
        Guid bookId, ISongService service, HttpContext context, string? search = null)
    {
        IResult? invalid = ReadPage(context, out int page);
        if (invalid is not null)
        {
            return invalid;
        }

        string term = search?.Trim() ?? string.Empty;
        if (term.Length > SongSearch.MaxLength)
        {
            return Results.ValidationProblem(new Dictionary<string, string[]>
            {
                ["search"] = ["Search must contain at most 100 characters."]
            });
        }

        PageResult<SongSummary> songs = term.Length == 0
            ? await service.GetSongsPageAsync(bookId, page)
            : await service.SearchSongsPageAsync(bookId, term, page);
        return Results.Ok(new PageResult<SongSummaryResponse>(
            songs.Items.Select(SongEndpoints.ToSummaryResponse).ToArray(), songs.Page, songs.HasNext));
    }

    private static IResult? ReadPage(HttpContext context, out int page)
    {
        StringValues value = context.Request.Query["page"];
        page = 1;
        if (value.Count > 0 &&
            (value.Count != 1 || !int.TryParse(value[0], System.Globalization.NumberStyles.Integer,
                System.Globalization.CultureInfo.InvariantCulture, out page)))
        {
            page = 0;
        }

        return EndpointHelpers.ValidatePage(page);
    }
}