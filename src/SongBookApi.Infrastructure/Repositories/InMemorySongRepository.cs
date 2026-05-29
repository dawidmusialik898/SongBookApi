using SongBookApi.Domain.Dto;
using SongBookApi.Domain.Repositories;
using System.Collections.Concurrent;

namespace SongBookApi.Infrastructure.Repositories;

public class InMemorySongRepository : ISongRepository
{
    private static readonly ConcurrentDictionary<Guid, Song> Songs = new();

    public Task<IEnumerable<Song>> GetllSongsAsync() => Task.FromResult(Songs.Values.AsEnumerable());

    public Task<Song?> GetSongByIdAsync(Guid id)
    {
        _ = Songs.TryGetValue(id, out Song? song);
        return Task.FromResult(song);
    }

    public Task<Song?> AddSongAsync(Song song)
    {
        ArgumentNullException.ThrowIfNull(song);

        if (song.Id == Guid.Empty)
        {
            song.Id = Guid.NewGuid();
        }

        bool added = Songs.TryAdd(song.Id, song);

        return !added
            ? Task.FromResult<Song?>(null)
            : Task.FromResult<Song?>(song);
    }

    public Task<bool> UpdateSongAsync(Song song)
    {
        ArgumentNullException.ThrowIfNull(song);

        if (!Songs.ContainsKey(song.Id))
        {
            return Task.FromResult(false);
        }

        Songs[song.Id] = song;
        return Task.FromResult(true);
    }

    public Task<bool> DeleteSongAsync(Guid id)
    {
        bool deleted = Songs.TryRemove(id, out _);
        return Task.FromResult(deleted);
    }
}
