namespace SongBookApi.Domain.Services;

public sealed record SelectedPdfSong(Guid Id, string Title);

public sealed record SongBookPdfInfo(
    Guid Id,
    bool IncludeChords,
    bool IsWholeBook,
    int SongCount,
    IReadOnlyList<SelectedPdfSong> SelectedSongs,
    DateTimeOffset GeneratedAtUtc,
    bool IsOutdated);

public sealed record SongBookPdfDownload(byte[] Content, bool IncludeChords);

public interface ISongBookPdfService
{
    Task<PageResult<SongBookPdfInfo>> ListAsync(Guid bookId, int page);
    Task<SongBookPdfInfo> GenerateAsync(Guid bookId, bool includeChords, IReadOnlyList<Guid>? songIds);
    Task<SongBookPdfDownload?> DownloadAsync(Guid bookId, Guid pdfId);
}
