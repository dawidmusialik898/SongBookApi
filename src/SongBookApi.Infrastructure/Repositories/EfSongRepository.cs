using Microsoft.EntityFrameworkCore;
using SongBookApi.Domain.Dto;
using SongBookApi.Domain.Repositories;
using SongBookApi.Infrastructure.Identity;

namespace SongBookApi.Infrastructure.Repositories;

public sealed class EfSongRepository(SongBookDbContext dbContext) : ISongRepository
{
    public async Task<IReadOnlyList<Song>> GetAllAsync(Guid songBookId) =>
        await dbContext.Songs
            .AsNoTracking()
            .Where(song => song.SongBookId == songBookId)
            .Include(song => song.Parts.OrderBy(part => part.Position))
            .OrderBy(song => song.Title)
            .ThenBy(song => song.Id)
            .ToListAsync();

    public async Task<Song?> GetByIdAsync(Guid songBookId, Guid songId) =>
        await dbContext.Songs
            .AsNoTracking()
            .Where(song => song.SongBookId == songBookId && song.Id == songId)
            .Include(song => song.Parts.OrderBy(part => part.Position))
            .SingleOrDefaultAsync();

    public async Task<Song> AddAsync(Guid songBookId, Song song)
    {
        DateTimeOffset now = DateTimeOffset.UtcNow;
        song.Id = song.Id == Guid.Empty ? Guid.NewGuid() : song.Id;
        song.SongBookId = songBookId;
        song.CreatedAtUtc = now;
        song.UpdatedAtUtc = now;
        for (int position = 0; position < song.Parts.Count; position++)
        {
            Part part = song.Parts[position];
            part.Id = part.Id == Guid.Empty ? Guid.NewGuid() : part.Id;
            part.SongId = song.Id;
            part.Position = position;
        }

        dbContext.Songs.Add(song);
        await dbContext.SaveChangesAsync();
        return song;
    }

    public async Task<bool> UpdateAsync(Guid songBookId, Guid songId, Song replacement)
    {
        Song? song = await dbContext.Songs
            .Include(candidate => candidate.Parts)
            .SingleOrDefaultAsync(candidate =>
                candidate.SongBookId == songBookId && candidate.Id == songId);
        if (song is null)
        {
            return false;
        }

        await using var transaction = await dbContext.Database.BeginTransactionAsync();
        int currentMaximum = song.Parts.Count == 0
            ? -1
            : song.Parts.Max(part => part.Position);
        int temporaryStart = Math.Max(currentMaximum + 1, replacement.Parts.Count) + 1024;
        for (int index = 0; index < song.Parts.Count; index++)
        {
            song.Parts[index].Position = temporaryStart + index;
        }
        await dbContext.SaveChangesAsync();

        Dictionary<Guid, Part> existing = song.Parts.ToDictionary(part => part.Id);
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
                    throw new ArgumentException("A submitted part ID does not belong to this song.", nameof(replacement));
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
            target.Text = requested.Text;
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
        await dbContext.SaveChangesAsync();
        await transaction.CommitAsync();
        song.Parts = finalParts;
        return true;
    }

    public async Task<bool> DeleteAsync(Guid songBookId, Guid songId)
    {
        Song? song = await dbContext.Songs.SingleOrDefaultAsync(candidate =>
            candidate.SongBookId == songBookId && candidate.Id == songId);
        if (song is null)
        {
            return false;
        }

        dbContext.Songs.Remove(song);
        await dbContext.SaveChangesAsync();
        return true;
    }
}
