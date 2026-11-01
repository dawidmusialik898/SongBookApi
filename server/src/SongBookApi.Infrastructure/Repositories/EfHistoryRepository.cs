using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using SongBookApi.Domain;
using SongBookApi.Domain.Dto;
using SongBookApi.Domain.Entities;
using SongBookApi.Domain.Repositories;
using SongBookApi.Domain.Services;
using SongBookApi.Infrastructure.Identity;

namespace SongBookApi.Infrastructure.Repositories;

public sealed class EfHistoryRepository(SongBookDbContext dbContext, ISongRepository songs,
    IMutationContext mutation) : IHistoryRepository
{
    public async Task<PageResult<ActivitySummary>> GetBookHistoryAsync(Guid bookId, bool includeOwnerOnly, int page)
        => Paging.FromLookahead(await (
            from entry in dbContext.BookActivities.AsNoTracking()
            join user in dbContext.Users.AsNoTracking() on entry.ActorId equals user.Id into actors
            from actor in actors.DefaultIfEmpty()
            join subjectUser in dbContext.Users.AsNoTracking() on entry.SubjectUserId equals subjectUser.Id into subjects
            from subject in subjects.DefaultIfEmpty()
            where entry.SongBookId == bookId && (includeOwnerOnly || !entry.OwnerOnly)
            orderby entry.OccurredAtUtc descending, entry.Id descending
            select new ActivitySummary(entry.Id, entry.SongId, entry.Revision, entry.Operation,
                entry.OccurredAtUtc, actor == null ? "Deleted user" : actor.UserName!, entry.Description,
                entry.Operation.StartsWith("collaborator.") ? subject == null ? "Deleted user" : subject.UserName : null))
            .Skip(Paging.Offset(page)).Take(Paging.Size + 1).ToListAsync(), page);

    public async Task<SongHistory?> GetSongHistoryAsync(Guid bookId, Guid songId, int page)
    {
        long latest = await dbContext.SongRevisions
            .Where(entry => entry.SongBookId == bookId && entry.SongId == songId)
            .MaxAsync(entry => (long?)entry.Revision) ?? 0;
        bool exists = await dbContext.Songs.AnyAsync(song => song.SongBookId == bookId && song.Id == songId);
        if (latest == 0 && !exists) return null;
        var summaries = await (
            from entry in dbContext.SongRevisions.AsNoTracking()
            join user in dbContext.Users.AsNoTracking() on entry.ActorId equals user.Id into actors
            from actor in actors.DefaultIfEmpty()
            where entry.SongBookId == bookId && entry.SongId == songId
            orderby entry.Revision descending
            select new RevisionSummary(entry.Revision, entry.Operation, entry.OccurredAtUtc,
                entry.Operation == "baseline" ? "Unknown (tracking baseline)" :
                    actor == null ? "Deleted user" : actor.UserName!, entry.RestoredFromRevision))
            .Skip(Paging.Offset(page)).Take(Paging.Size + 1).ToListAsync();
        return new SongHistory(Paging.FromLookahead(summaries, page), latest, !exists);
    }

    public async Task<RevisionDetail?> GetSnapshotAsync(Guid bookId, Guid songId, long revision)
    {
        SongRevision? entry = await dbContext.SongRevisions.AsNoTracking()
            .SingleOrDefaultAsync(entry => entry.SongBookId == bookId && entry.SongId == songId && entry.Revision == revision);
        if (entry is null) return null;
        string? actor = entry.ActorId is null ? null :
            await dbContext.Users.Where(user => user.Id == entry.ActorId).Select(user => user.UserName).SingleOrDefaultAsync();
        return new RevisionDetail(new RevisionSummary(entry.Revision, entry.Operation, entry.OccurredAtUtc,
            entry.Operation == "baseline" ? "Unknown (tracking baseline)" : actor ?? "Deleted user",
            entry.RestoredFromRevision), ReadSnapshot(entry));
    }

    public async Task<Song?> RestoreAsync(Guid bookId, Guid songId, long revision, long expectedRevision)
    {
        await using var transaction = await dbContext.Database.BeginTransactionAsync();
        if (!await dbContext.SongBooks.AnyAsync(book => book.Id == bookId)) return null;
        SongRevision? entry = await dbContext.SongRevisions.AsNoTracking().SingleOrDefaultAsync(entry =>
            entry.SongBookId == bookId && entry.SongId == songId && entry.Revision == revision);
        if (entry is null) return null;
        long latest = await dbContext.SongRevisions.Where(entry => entry.SongBookId == bookId && entry.SongId == songId)
            .MaxAsync(entry => entry.Revision);
        if (expectedRevision != latest) throw new SongRevisionConflictException();
        Song restored = ReadSnapshot(entry).Song;
        ValidateSnapshot(restored, bookId, songId);
        bool exists = await dbContext.Songs.AnyAsync(song => song.SongBookId == bookId && song.Id == songId);
        MutationContext previous = mutation.Current;
        mutation.Current = previous with { ExpectedRevision = latest, RestoredFromRevision = revision, Operation = "song.restored" };
        try
        {
            if (exists)
            {
                await songs.UpdateAsync(bookId, songId, restored);
            }
            else
            {
                if (await dbContext.Songs.AnyAsync(song => song.Id == songId) ||
                    await dbContext.Parts.AnyAsync(part => restored.Parts.Select(part => part.Id).Contains(part.Id)))
                    throw new SongRevisionConflictException("A historical song or part ID is already in use.");
                await songs.AddAsync(bookId, restored);
            }
            await transaction.CommitAsync();
        }
        finally
        {
            mutation.Current = previous;
        }
        return await songs.GetByIdAsync(bookId, songId);
    }

    private static SongSnapshot ReadSnapshot(SongRevision entry)
    {
        try
        {
            SongSnapshot? snapshot = JsonSerializer.Deserialize<SongSnapshot>(entry.SnapshotJson);
            if (snapshot?.SchemaVersion != 1 || snapshot.Song is null || snapshot.Song.Revision != entry.Revision)
                throw new SongRevisionConflictException("This stored snapshot schema cannot be restored.");
            return snapshot;
        }
        catch (JsonException)
        {
            throw new SongRevisionConflictException("This stored snapshot is invalid.");
        }
    }

    private static void ValidateSnapshot(Song song, Guid bookId, Guid songId)
    {
        if (song.Id != songId || song.SongBookId != bookId || song.Parts is null ||
            song.Parts.Any(part => part is null || part.Id == Guid.Empty) ||
            song.Parts.Select(part => part.Id).Distinct().Count() != song.Parts.Count)
            throw new SongRevisionConflictException("This stored snapshot is invalid.");
        for (int index = 0; index < song.Parts.Count; index++)
        {
            Part part = song.Parts[index];
            if (part.Position < 0 || (index > 0 && part.Position <= song.Parts[index - 1].Position) ||
                part.SongId != songId || part.Chords is null)
                throw new SongRevisionConflictException("This stored snapshot has invalid parts.");
            var offsets = new HashSet<int>();
            string text = part.Text ?? "";
            foreach (Chord chord in part.Chords)
            {
                if (chord is null || chord.PartId != part.Id || chord.Offset < 0 || chord.Offset >= text.Length ||
                    text[chord.Offset] is '\r' or '\n' || char.IsLowSurrogate(text[chord.Offset]) ||
                    (char.IsHighSurrogate(text[chord.Offset]) &&
                        (chord.Offset + 1 == text.Length || !char.IsLowSurrogate(text[chord.Offset + 1]))) ||
                    !offsets.Add(chord.Offset) || string.IsNullOrWhiteSpace(chord.Symbol) || chord.Symbol.Trim().Length > 64)
                    throw new SongRevisionConflictException("This stored snapshot has invalid chords.");
            }
        }
    }
}