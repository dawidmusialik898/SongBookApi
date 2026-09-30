using System.ComponentModel.DataAnnotations;
using System.Security.Claims;
using SongBookApi.Domain.Entities;
using SongBookApi.Domain.Services;
using SongBookApi.Service.Authentication;
using SongBookApi.Service.Contracts;

namespace SongBookApi.Service.Endpoints;

public static class SongBookEndpoints
{
    public static void MapSongBookEndpoints(this WebApplication app)
    {
        RouteGroupBuilder books = app.MapGroup("/songbooks")
            .RequireAuthorization(AuthConstants.AuthenticatedUserPolicy);

        books.MapGet("", List);
        books.MapPost("", Create).AddEndpointFilter<AntiforgeryValidationFilter>();
        books.MapGet("/{bookId:guid}", Get);
        books.MapPut("/{bookId:guid}", Rename).AddEndpointFilter<AntiforgeryValidationFilter>();
        books.MapDelete("/{bookId:guid}", Delete).AddEndpointFilter<AntiforgeryValidationFilter>();
        books.MapGet("/{bookId:guid}/access", ListAccess);
        books.MapPut("/{bookId:guid}/access", SetAccess).AddEndpointFilter<AntiforgeryValidationFilter>();
        books.MapDelete("/{bookId:guid}/access/{accessId:guid}", RemoveAccess)
            .AddEndpointFilter<AntiforgeryValidationFilter>();
    }

    private static async Task<IResult> List(
        ClaimsPrincipal principal,
        ISongBookService service)
    {
        IReadOnlyList<SongBookSummary> books =
            await service.ListAsync(EndpointHelpers.GetUserId(principal));
        return Results.Ok(books.Select(ToResponse));
    }

    private static async Task<IResult> Get(
        Guid bookId,
        ClaimsPrincipal principal,
        ISongBookService service)
    {
        SongBookSummary? book = await service.GetAsync(bookId, EndpointHelpers.GetUserId(principal));
        return book is null ? Results.NotFound() : Results.Ok(ToResponse(book));
    }

    private static async Task<IResult> Create(
        SongBookNameRequest request,
        ClaimsPrincipal principal,
        ISongBookService service)
    {
        try
        {
            SongBookSummary book =
                await service.CreateAsync(EndpointHelpers.GetUserId(principal), request.Name);
            return Results.Created($"/songbooks/{book.Id}", ToResponse(book));
        }
        catch (ValidationException exception)
        {
            return ValidationProblem("name", exception.Message);
        }
        catch (SongBookNameConflictException)
        {
            return Results.Conflict();
        }
    }

    private static async Task<IResult> Rename(
        Guid bookId,
        SongBookNameRequest request,
        ClaimsPrincipal principal,
        ISongBookAccessService accessService,
        ISongBookService service)
    {
        string userId = EndpointHelpers.GetUserId(principal);
        IResult? denial = await RequireAdminAsync(bookId, userId, accessService);
        if (denial is not null)
        {
            return denial;
        }

        try
        {
            await service.RenameAsync(bookId, userId, request.Name);
            return Results.NoContent();
        }
        catch (ValidationException exception)
        {
            return ValidationProblem("name", exception.Message);
        }
        catch (SongBookNameConflictException)
        {
            return Results.Conflict();
        }
        catch (KeyNotFoundException)
        {
            return Results.NotFound();
        }
    }

    private static async Task<IResult> Delete(
        Guid bookId,
        ClaimsPrincipal principal,
        ISongBookAccessService accessService,
        ISongBookService service)
    {
        string userId = EndpointHelpers.GetUserId(principal);
        IResult? denial = await RequireAdminAsync(bookId, userId, accessService);
        if (denial is not null)
        {
            return denial;
        }

        try
        {
            await service.DeleteAsync(bookId, userId);
            return Results.NoContent();
        }
        catch (KeyNotFoundException)
        {
            return Results.NotFound();
        }
    }

    private static async Task<IResult> ListAccess(
        Guid bookId,
        ClaimsPrincipal principal,
        ISongBookAccessService accessService,
        ISongBookService service)
    {
        string userId = EndpointHelpers.GetUserId(principal);
        IResult? denial = await RequireAdminAsync(bookId, userId, accessService);
        if (denial is not null)
        {
            return denial;
        }

        try
        {
            IReadOnlyList<SongBookMember> members = await service.ListMembersAsync(bookId, userId);
            return Results.Ok(members.Select(ToResponse));
        }
        catch (KeyNotFoundException)
        {
            return Results.NotFound();
        }
    }

    private static async Task<IResult> SetAccess(
        Guid bookId,
        SetSongBookAccessRequest request,
        ClaimsPrincipal principal,
        ISongBookAccessService accessService,
        ISongBookService service)
    {
        string userId = EndpointHelpers.GetUserId(principal);
        IResult? denial = await RequireAdminAsync(bookId, userId, accessService);
        if (denial is not null)
        {
            return denial;
        }

        if (!TryParseAccessLevel(request.AccessLevel, out SongBookAccessLevel level))
        {
            return ValidationProblem("accessLevel", "Access level must be reader or editor.");
        }

        try
        {
            SongBookMember? member =
                await service.SetAccessAsync(bookId, userId, request.Email, level);
            return member is null ? Results.NotFound() : Results.Ok(ToResponse(member));
        }
        catch (ValidationException exception)
        {
            return ValidationProblem("email", exception.Message);
        }
        catch (KeyNotFoundException)
        {
            return Results.NotFound();
        }
    }

    private static async Task<IResult> RemoveAccess(
        Guid bookId,
        Guid accessId,
        ClaimsPrincipal principal,
        ISongBookAccessService accessService,
        ISongBookService service)
    {
        string userId = EndpointHelpers.GetUserId(principal);
        IResult? denial = await RequireAdminAsync(bookId, userId, accessService);
        if (denial is not null)
        {
            return denial;
        }

        try
        {
            return await service.RemoveAccessAsync(bookId, userId, accessId)
                ? Results.NoContent()
                : Results.NotFound();
        }
        catch (KeyNotFoundException)
        {
            return Results.NotFound();
        }
    }

    private static async Task<IResult?> RequireAdminAsync(
        Guid bookId,
        string userId,
        ISongBookAccessService accessService)
    {
        EffectiveSongBookAccess access = await accessService.GetAccessAsync(bookId, userId);
        return access switch
        {
            EffectiveSongBookAccess.None => Results.NotFound(),
            EffectiveSongBookAccess.Admin => null,
            _ => Results.Forbid()
        };
    }

    private static bool TryParseAccessLevel(string? value, out SongBookAccessLevel level)
    {
        if (string.Equals(value, "reader", StringComparison.OrdinalIgnoreCase))
        {
            level = SongBookAccessLevel.Reader;
            return true;
        }
        if (string.Equals(value, "editor", StringComparison.OrdinalIgnoreCase))
        {
            level = SongBookAccessLevel.Editor;
            return true;
        }
        level = default;
        return false;
    }

    private static SongBookResponse ToResponse(SongBookSummary book) =>
        new(book.Id, book.Name, book.AccessLevel.ToContract(), book.SongCount);

    private static SongBookAccessResponse ToResponse(SongBookMember member) =>
        new(member.Id, member.Email, member.AccessLevel.ToString().ToLowerInvariant());

    private static IResult ValidationProblem(string key, string error) =>
        Results.ValidationProblem(new Dictionary<string, string[]> { [key] = [error] });
}
