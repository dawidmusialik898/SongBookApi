using Microsoft.Extensions.Logging;
using SongBookApi.Domain.Dto;
using SongBookApi.Domain.Repositories;

namespace SongBookApi.Domain.Services;

public interface ISongService
{
    Task<Song> CreateSongAsync(Guid songBookId, Song song);
    Task<bool> DeleteSongAsync(Guid songBookId, Guid songId);
    Task<PageResult<SongSummary>> SearchSongsPageAsync(Guid songBookId, string search, int page);
    Task<PageResult<SongSummary>> GetSongsPageAsync(Guid songBookId, int page);
    Task<AdjacentSongs?> GetAdjacentSongsAsync(Guid songBookId, Guid songId);
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

    public async Task<PageResult<SongSummary>> GetSongsPageAsync(Guid songBookId, int page)
    {
        _logger.LogInformation("Getting page {Page} of songs in book {SongBookId}", page, songBookId);
        return await _songRepository.GetPageAsync(songBookId, page);
    }

    public async Task<PageResult<SongSummary>> SearchSongsPageAsync(
        Guid songBookId,
        string search,
        int page)
    {
        IReadOnlyList<string> tokens = SongSearch.Tokenize(search);
        IReadOnlyList<SongIndexEntry> index = await _songRepository.GetIndexAsync(songBookId);
        SongSummary[] matches = index
            .Where(entry => SongSearch.Matches(entry, tokens))
            .Skip(Paging.Offset(page))
            .Take(Paging.Size + 1)
            .Select(ToSummary)
            .ToArray();
        return Paging.FromLookahead(matches, page);
    }

    public async Task<AdjacentSongs?> GetAdjacentSongsAsync(Guid songBookId, Guid songId)
    {
        IReadOnlyList<SongIndexEntry> index = await _songRepository.GetIndexAsync(songBookId);
        int position = -1;
        for (int indexPosition = 0; indexPosition < index.Count; indexPosition++)
        {
            if (index[indexPosition].Id == songId)
            {
                position = indexPosition;
                break;
            }
        }

        if (position < 0)
        {
            return null;
        }

        return new AdjacentSongs(
            position > 0 ? ToSummary(index[position - 1]) : null,
            position + 1 < index.Count ? ToSummary(index[position + 1]) : null);
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

    private static SongSummary ToSummary(SongIndexEntry entry) =>
        new(entry.Id, entry.Title, entry.Author, entry.Number);
}