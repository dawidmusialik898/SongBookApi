using System.Text.Json;
using SongBookApi.Domain.Dto;
using SongBookApi.Domain.Entities;
using SongBookApi.Domain.Services;
using SongBookApi.Infrastructure.Identity;

namespace SongBookApi.Infrastructure.Repositories;

public sealed class EfActivityWriter(SongBookDbContext dbContext, IMutationContext mutation) : IActivityWriter
{
    public void StageActivity(Guid bookId, string operation, Guid? songId = null,
        long? revision = null, bool ownerOnly = false, string? description = null, string? subjectUserId = null)
        => dbContext.BookActivities.Add(new BookActivity
        {
            SongBookId = bookId,
            SongId = songId,
            Revision = revision,
            Operation = operation,
            ActorId = mutation.Current.ActorId,
            OccurredAtUtc = DateTimeOffset.UtcNow,
            OwnerOnly = ownerOnly || operation.StartsWith("collaborator.", StringComparison.Ordinal) ||
                operation.StartsWith("link.", StringComparison.Ordinal),
            Description = description,
            SubjectUserId = subjectUserId
        });

    public void StageRevision(Song song, string operation, long? restoredFromRevision = null,
        bool unattributed = false)
    {
        // Normalize arrays without mutating the live tracked graph.
        Song clone = JsonSerializer.Deserialize<Song>(JsonSerializer.Serialize(song))!;
        clone.Parts = clone.Parts.OrderBy(part => part.Position).ToList();
        foreach (Part part in clone.Parts)
        {
            part.Chords = (part.Chords ?? []).OrderBy(chord => chord.Offset).ToList();
        }
        dbContext.SongRevisions.Add(new SongRevision
        {
            SongBookId = song.SongBookId,
            SongId = song.Id,
            Revision = song.Revision,
            Operation = operation,
            ActorId = unattributed ? null : mutation.Current.ActorId,
            OccurredAtUtc = DateTimeOffset.UtcNow,
            RestoredFromRevision = restoredFromRevision,
            SnapshotJson = JsonSerializer.Serialize(new SongSnapshot(1, clone))
        });
        if (!unattributed)
        {
            StageActivity(song.SongBookId, operation, song.Id, song.Revision, description: song.Title);
        }
    }
}