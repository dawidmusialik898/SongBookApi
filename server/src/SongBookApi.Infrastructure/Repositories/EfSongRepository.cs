using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using SongBookApi.Domain;
using SongBookApi.Domain.Dto;
using SongBookApi.Domain.Repositories;
using SongBookApi.Domain.Services;
using SongBookApi.Infrastructure.Identity;

namespace SongBookApi.Infrastructure.Repositories;

public sealed class EfSongRepository(SongBookDbContext dbContext, IMutationContext? mutationContext = null,
    IActivityWriter? activityWriter = null) : ISongRepository
{
    private readonly IMutationContext mutation = mutationContext ?? new CurrentMutation();
    private IActivityWriter Writer => activityWriter ?? new EfActivityWriter(dbContext, mutation);
    public async Task<PageResult<SongSummary>> GetPageAsync(Guid songBookId, int page)
        => Paging.FromLookahead(await dbContext.Songs
            .AsNoTracking()
            .Where(song => song.SongBookId == songBookId)
            .OrderBy(song => song.Title)
            .ThenBy(song => song.Id)
            .Skip(Paging.Offset(page))
            .Take(Paging.Size + 1)
            .Select(song => new SongSummary(song.Id, song.Title, song.Author, song.Number))
            .ToListAsync(), page);

    public async Task<IReadOnlyList<SongIndexEntry>> GetIndexAsync(Guid songBookId)
        => await dbContext.Songs
            .AsNoTracking()
            .Where(song => song.SongBookId == songBookId)
            .OrderBy(song => song.Title)
            .ThenBy(song => song.Id)
            .Select(song => new SongIndexEntry(
                song.Id,
                song.Title,
                song.OriginalTitle,
                song.Author,
                song.Number))
            .ToListAsync();

    public async Task<Song?> GetByIdAsync(Guid songBookId, Guid songId)
        => await dbContext.Songs
            .AsNoTracking()
            .Where(song => song.SongBookId == songBookId && song.Id == songId)
            .Include(song => song.Parts.OrderBy(part => part.Position))
            .ThenInclude(part => part.Chords)
            .SingleOrDefaultAsync();

    public async Task<Song> AddAsync(Guid songBookId, Song song)
    {
        await using IDbContextTransaction? transaction = dbContext.Database.CurrentTransaction is null
            ? await dbContext.Database.BeginTransactionAsync() : null;
        DateTimeOffset now = DateTimeOffset.UtcNow;
        song.Id = song.Id == Guid.Empty ? Guid.NewGuid() : song.Id;
        song.SongBookId = songBookId;
        if (!mutation.Current.RestoredFromRevision.HasValue) song.CreatedAtUtc = now;
        song.UpdatedAtUtc = now;
        song.Revision = mutation.Current.RestoredFromRevision.HasValue
            ? (await dbContext.SongRevisions.Where(entry => entry.SongBookId == songBookId && entry.SongId == song.Id)
                .MaxAsync(entry => (long?)entry.Revision) ?? 0) + 1
            : 1;
        for (int position = 0; position < song.Parts.Count; position++)
        {
            Part part = song.Parts[position];
            part.Id = part.Id == Guid.Empty ? Guid.NewGuid() : part.Id;
            part.SongId = song.Id;
            if (mutation.Current.Operation != "song.copied")
            {
                part.Position = position;
            }
            part.Chords ??= [];
            foreach (Chord chord in part.Chords)
            {
                chord.PartId = part.Id;
            }
        }

        dbContext.Songs.Add(song);
        Writer.StageRevision(song, mutation.Current.Operation ?? "song.created", mutation.Current.RestoredFromRevision);
        await dbContext.SaveChangesAsync();
        await MarkBookChangedAsync(songBookId);
        if (transaction is not null) await transaction.CommitAsync();
        return song;
    }

    public async Task<bool> UpdateAsync(Guid songBookId, Guid songId, Song replacement)
    {
        await using IDbContextTransaction? transaction = dbContext.Database.CurrentTransaction is null
            ? await dbContext.Database.BeginTransactionAsync() : null;
        Song? song = await dbContext.Songs
            .Include(candidate => candidate.Parts)
            .ThenInclude(part => part.Chords)
            .SingleOrDefaultAsync(candidate =>
                candidate.SongBookId == songBookId && candidate.Id == songId);
        if (song is null)
        {
            return false;
        }

        CheckExpectedRevision(song.Revision);
        CaptureBaseline(song);
        int currentMaximum = song.Parts.Count == 0
            ? -1
            : song.Parts.Max(part => part.Position);
        int temporaryStart = Math.Max(currentMaximum + 1, replacement.Parts.Count) + 1024;
        for (int index = 0; index < song.Parts.Count; index++)
        {
            song.Parts[index].Position = temporaryStart + index;
        }

        await dbContext.SaveChangesAsync();

        var existing = song.Parts.ToDictionary(part => part.Id);
        HashSet<Guid> retained = [];
        List<Part> finalParts = [];
        for (int position = 0; position < replacement.Parts.Count; position++)
        {
            Part requested = replacement.Parts[position];
            Part target;
            if (requested.Id != Guid.Empty)
            {
                if (!existing.TryGetValue(requested.Id, out target!))
                {
                    if (!mutation.Current.RestoredFromRevision.HasValue)
                    {
                        throw new ArgumentException("A submitted part ID does not belong to this song.", nameof(replacement));
                    }
                    if (await dbContext.Parts.AnyAsync(part => part.Id == requested.Id))
                    {
                        throw new SongRevisionConflictException("A historical part ID is already in use.");
                    }
                    target = new Part { Id = requested.Id, SongId = songId };
                    dbContext.Parts.Add(target);
                }

                if (!retained.Add(requested.Id))
                {
                    throw new ArgumentException("A part ID cannot be submitted more than once.", nameof(replacement));
                }
            }
            else
            {
                target = new Part { Id = Guid.NewGuid(), SongId = songId };
                dbContext.Parts.Add(target);
            }

            target.Name = requested.Name;
            if (requested.Chords is null && target.Chords?.Count > 0 &&
                target.Text != requested.Text)
            {
                throw new ArgumentException(
                    "Submit chords when changing lyrics in a part that already has chords.",
                    nameof(replacement));
            }

            target.Text = requested.Text;
            if (requested.Chords is not null)
            {
                target.Chords ??= [];
                var existingChords =
                    target.Chords.ToDictionary(chord => chord.Offset);
                HashSet<int> requestedOffsets = [];
                foreach (Chord chord in requested.Chords)
                {
                    requestedOffsets.Add(chord.Offset);
                    if (existingChords.TryGetValue(chord.Offset, out Chord? savedChord))
                    {
                        savedChord.Symbol = chord.Symbol;
                    }
                    else
                    {
                        target.Chords.Add(new Chord
                        {
                            PartId = target.Id,
                            Offset = chord.Offset,
                            Symbol = chord.Symbol
                        });
                    }
                }

                foreach (Chord removed in existingChords.Values
                    .Where(chord => !requestedOffsets.Contains(chord.Offset)))
                {
                    dbContext.Chords.Remove(removed);
                    target.Chords.Remove(removed);
                }
            }

            target.Position = position;
            finalParts.Add(target);
        }

        foreach (Part removed in existing.Values.Where(part => !retained.Contains(part.Id)))
        {
            dbContext.Parts.Remove(removed);
        }

        song.Title = replacement.Title;
        song.Author = replacement.Author;
        song.OriginalTitle = replacement.OriginalTitle;
        song.Number = replacement.Number;
        song.Key = replacement.Key;
        song.Tempo = replacement.Tempo;
        song.UpdatedAtUtc = DateTimeOffset.UtcNow;
        song.Revision++;
        song.Parts = finalParts;
        Writer.StageRevision(song, mutation.Current.Operation ?? "song.updated", mutation.Current.RestoredFromRevision);
        await dbContext.SaveChangesAsync();
        await MarkBookChangedAsync(songBookId);
        if (transaction is not null) await transaction.CommitAsync();
        return true;
    }

    public async Task<bool> DeleteAsync(Guid songBookId, Guid songId)
    {
        await using IDbContextTransaction? transaction = dbContext.Database.CurrentTransaction is null
            ? await dbContext.Database.BeginTransactionAsync() : null;
        Song? song = await dbContext.Songs.Include(candidate => candidate.Parts).ThenInclude(part => part.Chords)
            .SingleOrDefaultAsync(candidate =>
            candidate.SongBookId == songBookId && candidate.Id == songId);
        if (song is null)
        {
            return false;
        }

        CheckExpectedRevision(song.Revision);
        CaptureBaseline(song);
        song.Revision++;
        Writer.StageRevision(song, "song.deleted");
        dbContext.Songs.Remove(song);
        await dbContext.SaveChangesAsync();
        await MarkBookChangedAsync(songBookId);
        if (transaction is not null) await transaction.CommitAsync();
        return true;
    }

    private void CheckExpectedRevision(long revision)
    {
        if (mutation.Current.ExpectedRevision is long expected && expected != revision)
        {
            throw new SongRevisionConflictException();
        }
    }

    private void CaptureBaseline(Song song)
    {
        if (song.Revision == 0)
        {
            song.Revision = 1;
            Writer.StageRevision(song, "baseline", unattributed: true);
        }
    }

    private async Task MarkBookChangedAsync(Guid songBookId)
        => await dbContext.SongBooks
            .Where(book => book.Id == songBookId)
            .ExecuteUpdateAsync(setters => setters
                .SetProperty(book => book.ContentRevision, book => book.ContentRevision + 1)
                .SetProperty(book => book.UpdatedAtUtc, DateTimeOffset.UtcNow));
}