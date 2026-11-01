using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using SongBookApi.Domain;
using SongBookApi.Domain.Dto;
using SongBookApi.Domain.Entities;
using SongBookApi.Domain.Repositories;
using SongBookApi.Domain.Services;
using SongBookApi.Infrastructure.Identity;

namespace SongBookApi.Infrastructure.Repositories;

public sealed class EfSongBookPdfRepository(SongBookDbContext dbContext, IActivityWriter writer)
    : ISongBookPdfRepository
{
    public async Task<SongBookPdfSnapshot?> GetSnapshotAsync(
        Guid bookId,
        IReadOnlyCollection<Guid>? songIds)
    {
        await using IDbContextTransaction transaction = await dbContext.Database.BeginTransactionAsync();
        var book = await dbContext.SongBooks
            .AsNoTracking()
            .Where(candidate => candidate.Id == bookId)
            .Select(candidate => new { candidate.Name, candidate.ContentRevision })
            .SingleOrDefaultAsync();
        if (book is null)
        {
            return null;
        }

        IQueryable<Song> query = dbContext.Songs
            .AsNoTracking()
            .Where(song => song.SongBookId == bookId);
        if (songIds is not null)
        {
            Guid[] ids = [.. songIds];
            query = query.Where(song => ids.Contains(song.Id));
        }

        List<Song> songs = await query
            .OrderBy(song => song.Title)
            .ThenBy(song => song.Id)
            .Include(song => song.Parts.OrderBy(part => part.Position))
            .ThenInclude(part => part.Chords)
            .AsSplitQuery()
            .ToListAsync();
        await transaction.CommitAsync();

        return new SongBookPdfSnapshot(book.Name, book.ContentRevision, songs);
    }

    public async Task<PageResult<SongBookPdfListing>> ListAsync(Guid bookId, int page)
        => Paging.FromLookahead(await dbContext.SongBookPdfs
            .AsNoTracking()
            .Where(pdf => pdf.SongBookId == bookId)
            .OrderByDescending(pdf => pdf.GeneratedAtUtc)
            .ThenByDescending(pdf => pdf.Id)
            .Skip(Paging.Offset(page))
            .Take(Paging.Size + 1)
            .Select(pdf => new SongBookPdfListing(
                pdf.Id,
                pdf.GeneratedAtUtc,
                pdf.ContentRevision,
                pdf.SongBook.ContentRevision,
                pdf.IncludeChords,
                pdf.IsWholeBook,
                pdf.SongCount,
                pdf.SelectedSongsJson,
                pdf.FontFamily,
                pdf.FontSize,
                pdf.Orientation,
                pdf.Columns))
            .ToListAsync(), page);

    public Task<SongBookPdf?> GetAsync(Guid bookId, Guid pdfId)
        => dbContext.SongBookPdfs
            .AsNoTracking()
            .SingleOrDefaultAsync(pdf => pdf.SongBookId == bookId && pdf.Id == pdfId);

    public async Task<long> AddAsync(SongBookPdf pdf)
    {
        await using IDbContextTransaction transaction = await dbContext.Database.BeginTransactionAsync();
        dbContext.SongBookPdfs.Add(pdf);
        writer.StageActivity(pdf.SongBookId, "pdf.generated");
        await dbContext.SaveChangesAsync();
        long revision = await dbContext.SongBooks
            .Where(book => book.Id == pdf.SongBookId)
            .Select(book => book.ContentRevision)
            .SingleAsync();
        await transaction.CommitAsync();
        return revision;
    }

    public Task<int> DeleteOlderThanNewestAsync(Guid bookId, int keep)
    {
        ArgumentOutOfRangeException.ThrowIfNegative(keep);
        IQueryable<Guid> newest = dbContext.SongBookPdfs
            .Where(pdf => pdf.SongBookId == bookId)
            .OrderByDescending(pdf => pdf.GeneratedAtUtc)
            .ThenByDescending(pdf => pdf.Id)
            .Take(keep)
            .Select(pdf => pdf.Id);
        return dbContext.SongBookPdfs
            .Where(pdf => pdf.SongBookId == bookId && !newest.Contains(pdf.Id))
            .ExecuteDeleteAsync();
    }
}