using Microsoft.Extensions.Logging;
using SongBookApi.Domain.Dto;
using SongBookApi.Domain.Repositories;

namespace SongBookApi.Domain.Services;

public interface ISongService
{
    Task<Song?> CreateSongAsync(Song songDto);
    Task<bool> DeleteSongAsync(Guid id);
    Task<IEnumerable<Song>> GetAllSongsAsync();
    Task<Song?> GetSongByIdAsync(Guid id);
    Task<bool> UpdateSongAsync(Guid id, Song songDto);
}

public class SongService : ISongService
{
    private readonly ISongRepository _songRepository;
    private readonly ILogger _logger;
    public SongService(
        ISongRepository songRepository,
        ILogger<SongService> logger)
    {
        _songRepository = songRepository;
        _logger = logger;
    }

    public async Task<Song?> CreateSongAsync(Song songDto)
    {
        _logger.LogInformation("Creating a new song with title: {Title}", songDto.Title);
        return await _songRepository.AddSongAsync(songDto);
    }
    public async Task<bool> DeleteSongAsync(Guid id)
    {
        _logger.LogInformation("Deleting song with id: {Id}", id);
        return await _songRepository.DeleteSongAsync(id);
    }

    public async Task<IEnumerable<Song>> GetAllSongsAsync()
    {
        _logger.LogInformation("Getting all songs");
        return await _songRepository.GetllSongsAsync();
    }

    public async Task<Song?> GetSongByIdAsync(Guid id)
    {
        _logger.LogInformation("Getting song with id: {Id}", id);
        return await _songRepository.GetSongByIdAsync(id);
    }

    public async Task<bool> UpdateSongAsync(Guid id, Song songDto)
    {
        _logger.LogInformation("Updating song with id: {Id}", id);
        return await _songRepository.UpdateSongAsync(songDto);
    }
}