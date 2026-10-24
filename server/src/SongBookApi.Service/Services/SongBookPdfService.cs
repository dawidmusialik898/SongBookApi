using System.ComponentModel.DataAnnotations;
using System.Text.Json;
using SongBookApi.Domain;
using SongBookApi.Domain.Entities;
using SongBookApi.Domain.Repositories;
using SongBookApi.Domain.Services;

namespace SongBookApi.Service.Services;

public sealed class SongBookPdfService(ISongBookPdfRepository repository) : ISongBookPdfService
{
    public async Task<PageResult<SongBookPdfInfo>> ListAsync(Guid bookId, int page)
    {
        PageResult<SongBookPdfListing> pdfs = await repository.ListAsync(bookId, page);
        return new PageResult<SongBookPdfInfo>(
            pdfs.Items.Select(ToInfo).ToArray(),
            pdfs.Page,
            pdfs.HasNext);
    }

    public async Task<SongBookPdfInfo> GenerateAsync(
        Guid bookId,
        bool includeChords,
        IReadOnlyList<Guid>? songIds)
    {
        if (songIds is { Count: 0 } ||
            songIds?.Any(id => id == Guid.Empty) == true ||
            songIds?.Distinct().Count() != songIds?.Count)
        {
            throw new ValidationException("Select one or more distinct songs, or omit songIds for the whole book.");
        }

        SongBookPdfSnapshot snapshot = await repository.GetSnapshotAsync(bookId, songIds)
            ?? throw new KeyNotFoundException();
        if (songIds is not null && snapshot.Songs.Count != songIds.Count)
        {
            throw new ValidationException("Every selected song must belong to this song book.");
        }

        DateTimeOffset generatedAtUtc = DateTimeOffset.UtcNow;
        SelectedPdfSong[] selectedSongs = songIds is null
            ? []
            : snapshot.Songs
                .Select(song => new SelectedPdfSong(song.Id, song.Title ?? "Untitled"))
                .ToArray();
        SongBookPdf pdf = new()
        {
            Id = Guid.NewGuid(),
            SongBookId = bookId,
            GeneratedAtUtc = generatedAtUtc,
            ContentRevision = snapshot.ContentRevision,
            IncludeChords = includeChords,
            IsWholeBook = songIds is null,
            SongCount = snapshot.Songs.Count,
            SelectedSongsJson = JsonSerializer.Serialize(selectedSongs),
            Content = SongBookPdfRenderer.Render(snapshot, includeChords, generatedAtUtc)
        };
        long currentRevision = await repository.AddAsync(pdf);
        return new SongBookPdfInfo(
            pdf.Id,
            pdf.IncludeChords,
            pdf.IsWholeBook,
            pdf.SongCount,
            selectedSongs,
            pdf.GeneratedAtUtc,
            pdf.ContentRevision != currentRevision);
    }

    public async Task<SongBookPdfDownload?> DownloadAsync(Guid bookId, Guid pdfId)
    {
        SongBookPdf? pdf = await repository.GetAsync(bookId, pdfId);
        return pdf is null ? null : new SongBookPdfDownload(pdf.Content, pdf.IncludeChords);
    }

    private static SongBookPdfInfo ToInfo(SongBookPdfListing pdf) =>
        new(
            pdf.Id,
            pdf.IncludeChords,
            pdf.IsWholeBook,
            pdf.SongCount,
            JsonSerializer.Deserialize<SelectedPdfSong[]>(pdf.SelectedSongsJson)
                ?? throw new JsonException("Stored PDF song selection is invalid."),
            pdf.GeneratedAtUtc,
            pdf.ContentRevision != pdf.CurrentRevision);
}
