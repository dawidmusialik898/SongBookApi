using SongBookApi.Domain.Dto;

namespace SongBookApi.Domain.Repositories;

public interface ISongRepository
{
    Task<Song?> GetSongByIdAsync(Guid id);
    Task<IEnumerable<Song>> GetllSongsAsync();
    Task<Song?> AddSongAsync(Song song);
    Task<bool> UpdateSongAsync(Song song);
    Task<bool> DeleteSongAsync(Guid id);
}
