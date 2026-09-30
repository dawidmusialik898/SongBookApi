using SongBookApi.Domain.Dto;

namespace SongBookApi.Domain.Repositories;

public interface ISongRepository
{
    Task<PageResult<SongSummary>> GetPageAsync(Guid songBookId, int page);
    Task<Song?> GetByIdAsync(Guid songBookId, Guid songId);
    Task<Song> AddAsync(Guid songBookId, Song song);
    Task<bool> UpdateAsync(Guid songBookId, Guid songId, Song song);
    Task<bool> DeleteAsync(Guid songBookId, Guid songId);
}
