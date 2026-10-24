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
        var routeId = Guid.NewGuid();
        var bodyId = Guid.NewGuid();
        Song request = new()
        {
            Id = bodyId,
            Title = "Updated through route"
        };
        RecordingSongRepository repository = new();
        SongService service = new(repository, NullLogger<SongService>.Instance);

        var bookId = Guid.NewGuid();
        bool updated = await service.UpdateSongAsync(bookId, routeId, request);

        Assert.True(updated);
        Assert.Same(request, repository.UpdatedSong);
        Assert.Equal(routeId, repository.UpdatedSong.Id);
        Assert.Equal(bookId, repository.UpdatedSong.SongBookId);
        Assert.NotEqual(bodyId, repository.UpdatedSong.Id);
    }

    [Fact]
    public async Task SearchSongsPageAsync_FiltersWithoutChangingIndexOrder()
    {
        SongIndexEntry[] index =
        [
            new(TestId(3), "Needle first", null, null, null),
            new(TestId(1), "Something else", null, null, null),
            new(TestId(2), "Needle second", null, null, null)
        ];
        SongService service = CreateService(new IndexSongRepository(index));

        PageResult<SongSummary> result =
            await service.SearchSongsPageAsync(Guid.NewGuid(), "needle", 1);

        Assert.Equal(new[] { TestId(3), TestId(2) }, result.Items.Select(song => song.Id));
        Assert.Equal(1, result.Page);
        Assert.False(result.HasNext);
    }

    [Fact]
    public async Task SearchSongsPageAsync_PaginatesAfterFilteringWithLookahead()
    {
        SongIndexEntry[] index = [.. Enumerable.Range(0, 55)
            .Select(index => new SongIndexEntry(
                TestId(55 - index),
                $"Needle {index:D2}",
                null,
                null,
                null))];
        SongService service = CreateService(new IndexSongRepository(index));
        var songBookId = Guid.NewGuid();

        PageResult<SongSummary> first =
            await service.SearchSongsPageAsync(songBookId, "needle", 1);
        PageResult<SongSummary> second =
            await service.SearchSongsPageAsync(songBookId, "needle", 2);

        Assert.Equal(50, first.Items.Count);
        Assert.True(first.HasNext);
        Assert.Equal(index.Take(50).Select(ToSummary), first.Items);
        Assert.Equal(5, second.Items.Count);
        Assert.False(second.HasNext);
        Assert.Equal(index.Skip(50).Select(ToSummary), second.Items);
    }

    [Fact]
    public async Task GetAdjacentSongsAsync_ReturnsNeighborsAtTheFirstMiddleAndLastPositions()
    {
        SongIndexEntry[] index =
        [
            new(TestId(3), "First", null, null, null),
            new(TestId(1), "Middle", null, null, null),
            new(TestId(2), "Last", null, null, null)
        ];
        SongService service = CreateService(new IndexSongRepository(index));
        var songBookId = Guid.NewGuid();

        for (int position = 0; position < index.Length; position++)
        {
            AdjacentSongs? result =
                await service.GetAdjacentSongsAsync(songBookId, index[position].Id);

            Assert.NotNull(result);
            Assert.Equal(
                position > 0 ? ToSummary(index[position - 1]) : null,
                result.Previous);
            Assert.Equal(
                position + 1 < index.Length ? ToSummary(index[position + 1]) : null,
                result.Next);
        }
    }

    [Fact]
    public async Task GetAdjacentSongsAsync_HandlesSingleAndMissingSongs()
    {
        SongIndexEntry onlySong = new(TestId(1), "Only song", null, null, null);
        SongService service = CreateService(new IndexSongRepository([onlySong]));
        var songBookId = Guid.NewGuid();

        Assert.Equal(
            new AdjacentSongs(null, null),
            await service.GetAdjacentSongsAsync(songBookId, onlySong.Id));
        Assert.Null(await service.GetAdjacentSongsAsync(songBookId, TestId(2)));
    }

    private sealed class RecordingSongRepository : ISongRepository
    {
        public Song UpdatedSong { get; private set; } = null!;

        public Task<Song?> GetByIdAsync(Guid songBookId, Guid songId)
            => throw new NotSupportedException();

        public Task<PageResult<SongSummary>> GetPageAsync(Guid songBookId, int page)
            => throw new NotSupportedException();

        public Task<IReadOnlyList<SongIndexEntry>> GetIndexAsync(Guid songBookId)
            => throw new NotSupportedException();

        public Task<Song> AddAsync(Guid songBookId, Song song)
            => throw new NotSupportedException();

        public Task<bool> UpdateAsync(Guid songBookId, Guid songId, Song song)
        {
            UpdatedSong = song;
            return Task.FromResult(true);
        }

        public Task<bool> DeleteAsync(Guid songBookId, Guid songId)
            => throw new NotSupportedException();
    }

    private sealed class IndexSongRepository(IReadOnlyList<SongIndexEntry> index)
        : ISongRepository
    {
        public Task<IReadOnlyList<SongIndexEntry>> GetIndexAsync(Guid songBookId)
            => Task.FromResult(index);

        public Task<PageResult<SongSummary>> GetPageAsync(Guid songBookId, int page)
            => throw new NotSupportedException();

        public Task<Song?> GetByIdAsync(Guid songBookId, Guid songId)
            => throw new NotSupportedException();

        public Task<Song> AddAsync(Guid songBookId, Song song)
            => throw new NotSupportedException();

        public Task<bool> UpdateAsync(Guid songBookId, Guid songId, Song song)
            => throw new NotSupportedException();

        public Task<bool> DeleteAsync(Guid songBookId, Guid songId)
            => throw new NotSupportedException();
    }

    private static SongService CreateService(ISongRepository repository)
        => new(repository, NullLogger<SongService>.Instance);

    private static Guid TestId(int value)
        => Guid.Parse($"00000000-0000-0000-0000-{value:D12}");

    private static SongSummary ToSummary(SongIndexEntry entry)
        => new(entry.Id, entry.Title, entry.Author, entry.Number);
}
