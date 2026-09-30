using Microsoft.Extensions.Logging.Abstractions;
using SongBookApi.Domain;
using SongBookApi.Domain.Dto;
using SongBookApi.Domain.Repositories;
using SongBookApi.Domain.Services;

namespace SongBookApi.Service.Tests.Unit;

[Trait("Category", "Unit")]
public sealed class SongServiceTests
{
    [Fact]
    public async Task UpdateSongAsync_OverwritesBodyIdWithRouteId()
    {
        Guid routeId = Guid.NewGuid();
        Guid bodyId = Guid.NewGuid();
        Song request = new()
        {
            Id = bodyId,
            Title = "Updated through route"
        };
        RecordingSongRepository repository = new();
        SongService service = new(repository, NullLogger<SongService>.Instance);

        Guid bookId = Guid.NewGuid();
        bool updated = await service.UpdateSongAsync(bookId, routeId, request);

        Assert.True(updated);
        Assert.Same(request, repository.UpdatedSong);
        Assert.Equal(routeId, repository.UpdatedSong.Id);
        Assert.Equal(bookId, repository.UpdatedSong.SongBookId);
        Assert.NotEqual(bodyId, repository.UpdatedSong.Id);
    }

    private sealed class RecordingSongRepository : ISongRepository
    {
        public Song UpdatedSong { get; private set; } = null!;

        public Task<Song?> GetByIdAsync(Guid songBookId, Guid songId) =>
            throw new NotSupportedException();

        public Task<PageResult<SongSummary>> GetPageAsync(Guid songBookId, int page) =>
            throw new NotSupportedException();

        public Task<Song> AddAsync(Guid songBookId, Song song) =>
            throw new NotSupportedException();

        public Task<bool> UpdateAsync(Guid songBookId, Guid songId, Song song)
        {
            UpdatedSong = song;
            return Task.FromResult(true);
        }

        public Task<bool> DeleteAsync(Guid songBookId, Guid songId) =>
            throw new NotSupportedException();
    }
}
