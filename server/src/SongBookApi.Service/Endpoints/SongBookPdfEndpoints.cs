using System.ComponentModel.DataAnnotations;
using System.Security.Claims;
using SongBookApi.Domain;
using SongBookApi.Domain.Services;
using SongBookApi.Service.Authentication;
using SongBookApi.Service.Contracts;

namespace SongBookApi.Service.Endpoints;

public static class SongBookPdfEndpoints
{
    public static void MapSongBookPdfEndpoints(this WebApplication app)
    {
        RouteGroupBuilder pdfs = app.MapGroup("/songbooks/{bookId:guid}/pdfs")
            .RequireAuthorization(AuthConstants.AuthenticatedUserPolicy);

        pdfs.MapGet("", List);
        pdfs.MapPost("", Generate).AddEndpointFilter<AntiforgeryValidationFilter>();
        pdfs.MapGet("/{pdfId:guid}/download", Download);
    }

    private static async Task<IResult> List(
        Guid bookId,
        ClaimsPrincipal principal,
        ISongBookAccessService accessService,
        ISongBookPdfService service,
        int page = 1)
    {
        IResult? denial = await RequireAccessAsync(bookId, principal, accessService, ownerOnly: false);
        if (denial is not null)
        {
            return denial;
        }
        IResult? invalidPage = EndpointHelpers.ValidatePage(page);
        if (invalidPage is not null)
        {
            return invalidPage;
        }

        PageResult<SongBookPdfInfo> pdfs = await service.ListAsync(bookId, page);
        return Results.Ok(pdfs);
    }

    private static async Task<IResult> Generate(
        Guid bookId,
        GenerateSongBookPdfRequest request,
        ClaimsPrincipal principal,
        ISongBookAccessService accessService,
        ISongBookPdfService service)
    {
        IResult? denial = await RequireAccessAsync(bookId, principal, accessService, ownerOnly: true);
        if (denial is not null)
        {
            return denial;
        }
        if (!request.IncludeChords.HasValue)
        {
            return Results.ValidationProblem(new Dictionary<string, string[]>
            {
                ["includeChords"] = ["Specify whether to include chords."]
            });
        }

        try
        {
            SongBookPdfInfo pdf =
                await service.GenerateAsync(bookId, request.IncludeChords.Value, request.SongIds);
            return Results.Created($"/songbooks/{bookId}/pdfs/{pdf.Id}/download", pdf);
        }
        catch (ValidationException exception)
        {
            return Results.ValidationProblem(new Dictionary<string, string[]>
            {
                ["songIds"] = [exception.Message]
            });
        }
        catch (KeyNotFoundException)
        {
            return Results.NotFound();
        }
    }

    private static async Task<IResult> Download(
        Guid bookId,
        Guid pdfId,
        HttpContext context,
        ClaimsPrincipal principal,
        ISongBookAccessService accessService,
        ISongBookPdfService service)
    {
        IResult? denial = await RequireAccessAsync(bookId, principal, accessService, ownerOnly: false);
        if (denial is not null)
        {
            return denial;
        }
        SongBookPdfDownload? pdf = await service.DownloadAsync(bookId, pdfId);
        if (pdf is null)
        {
            return Results.NotFound();
        }

        context.Response.Headers.CacheControl = "private, no-store";
        string variant = pdf.IncludeChords ? "chords" : "lyrics";
        return Results.File(
            pdf.Content,
            "application/pdf",
            $"songbook-{bookId:N}-{variant}-{pdfId:N}.pdf");
    }

    private static async Task<IResult?> RequireAccessAsync(
        Guid bookId,
        ClaimsPrincipal principal,
        ISongBookAccessService accessService,
        bool ownerOnly)
    {
        EffectiveSongBookAccess access = await accessService.GetAccessAsync(
            bookId, EndpointHelpers.GetUserId(principal));
        return access switch
        {
            EffectiveSongBookAccess.None => Results.NotFound(),
            EffectiveSongBookAccess.Admin => null,
            _ when ownerOnly => Results.Forbid(),
            _ => null
        };
    }
}
