using SongBookApi.Domain.Dto;
using SongBookApi.Domain.Entities;

namespace SongBookApi.Domain.Repositories;

public sealed record SongBookPdfSnapshot(string BookName, long ContentRevision, IReadOnlyList<Song> Songs);

public sealed record SongBookPdfListing(
    Guid Id,
    DateTimeOffset GeneratedAtUtc,
    long ContentRevision,
    long CurrentRevision,
    bool IncludeChords,
    bool IsWholeBook,
    int SongCount,
    string SelectedSongsJson);

public interface ISongBookPdfRepository
{
    Task<SongBookPdfSnapshot?> GetSnapshotAsync(Guid bookId, IReadOnlyCollection<Guid>? songIds);
    Task<PageResult<SongBookPdfListing>> ListAsync(Guid bookId, int page);
    Task<SongBookPdf?> GetAsync(Guid bookId, Guid pdfId);
    Task<long> AddAsync(SongBookPdf pdf);
}
