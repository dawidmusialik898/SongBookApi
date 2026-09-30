using Microsoft.Extensions.Logging;
using SongBookApi.Domain.Dto;
using SongBookApi.Domain.Repositories;

namespace SongBookApi.Domain.Services;

public interface ISongService
{
    Task<Song> CreateSongAsync(Guid songBookId, Song song);
    Task<bool> DeleteSongAsync(Guid songBookId, Guid songId);
    Task<IReadOnlyList<Song>> GetAllSongsAsync(Guid songBookId);
    Task<Song?> GetSongByIdAsync(Guid songBookId, Guid songId);
    Task<bool> UpdateSongAsync(Guid songBookId, Guid songId, Song song);
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

    public async Task<Song> CreateSongAsync(Guid songBookId, Song song)
    {
        _logger.LogInformation("Creating a new song in book {SongBookId} with title: {Title}", songBookId, song.Title);
        return await _songRepository.AddAsync(songBookId, song);
    }
    public async Task<bool> DeleteSongAsync(Guid songBookId, Guid songId)
    {
        _logger.LogInformation("Deleting song {SongId} from book {SongBookId}", songId, songBookId);
        return await _songRepository.DeleteAsync(songBookId, songId);
    }

    public async Task<IReadOnlyList<Song>> GetAllSongsAsync(Guid songBookId)
    {
        _logger.LogInformation("Getting all songs in book {SongBookId}", songBookId);
        return await _songRepository.GetAllAsync(songBookId);
    }

    public async Task<Song?> GetSongByIdAsync(Guid songBookId, Guid songId)
    {
        _logger.LogInformation("Getting song {SongId} from book {SongBookId}", songId, songBookId);
        return await _songRepository.GetByIdAsync(songBookId, songId);
    }

    public async Task<bool> UpdateSongAsync(Guid songBookId, Guid songId, Song song)
    {
        _logger.LogInformation("Updating song {SongId} in book {SongBookId}", songId, songBookId);
        song.Id = songId;
        song.SongBookId = songBookId;
        return await _songRepository.UpdateAsync(songBookId, songId, song);
    }
}