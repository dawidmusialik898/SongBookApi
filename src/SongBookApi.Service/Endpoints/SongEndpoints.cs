using Microsoft.AspNetCore.Mvc;
using SongBookApi.Domain.Dto;
using SongBookApi.Domain.Services;

namespace SongBookApi.Service.Endpoints;

public static class SongEndpoints
{
    public static void MapSongEndpoints(this WebApplication app)
    {
        _ = app.MapGet("/songs", GetSongs)
            .WithName("GetSongs");

        _ = app.MapGet("/songs/{id}", GetSongById)
            .WithName("GetSongById");

        _ = app.MapPost("/songs", CreateSong)
            .Accepts<Song>("application/json")
            .Produces<Song>(201)
            .WithName("CreateSong");

        _ = app.MapPut("/songs/{id}", UpdateSong)
            .Accepts<Song>("application/json")
            .Produces(204)
            .WithName("UpdateSong");

        _ = app.MapDelete("/songs/{id}", DeleteSong)
            .Produces(204)
            .WithName("DeleteSong");
    }

    private static async Task<IResult> GetSongs(
        [FromServices] ISongService songService,
        [FromServices] ILogger<SongService> logger)
    {
        try
        {
            IEnumerable<Song> songs = await songService.GetAllSongsAsync();
            return Results.Ok(songs);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Exceptions happend when trying to get songs.");
            return Results.InternalServerError();
        }
    }

    private static async Task<IResult> GetSongById(
        Guid id,
        [FromServices] ISongService songService,
        [FromServices] ILogger<SongService> logger)
    {
        try
        {
            Song? song = await songService.GetSongByIdAsync(id);
            return song is not null ? Results.Ok(song) : Results.NotFound();
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Exceptions happend when trying to get songs.");
            return Results.InternalServerError();
        }
    }

    private static async Task<IResult> CreateSong(Song songDto, [FromServices] ISongService songService)
    {
        Song? createdSong = await songService.CreateSongAsync(songDto);
        return createdSong is not null ? Results.Created($"/songs/{createdSong.Id}", createdSong) : Results.BadRequest();
    }

    private static async Task<IResult> UpdateSong(Guid id, Song songDto, [FromServices] ISongService songService)
    {
        bool updated = await songService.UpdateSongAsync(id, songDto);
        return updated ? Results.NoContent() : Results.NotFound();
    }

    private static async Task<IResult> DeleteSong(Guid id, [FromServices] ISongService songService)
    {
        bool deleted = await songService.DeleteSongAsync(id);
        return deleted ? Results.NoContent() : Results.NotFound();
    }
}