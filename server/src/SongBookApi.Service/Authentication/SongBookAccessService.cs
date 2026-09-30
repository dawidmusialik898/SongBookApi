using Microsoft.EntityFrameworkCore;
using SongBookApi.Domain.Entities;
using SongBookApi.Domain.Services;
using SongBookApi.Infrastructure.Identity;

namespace SongBookApi.Service.Authentication;

public sealed class SongBookAccessService(SongBookDbContext dbContext) : ISongBookAccessService
{
    public async Task<EffectiveSongBookAccess> GetAccessAsync(Guid songBookId, string userId)
    {
        var access = await dbContext.SongBooks
            .AsNoTracking()
            .Where(book => book.Id == songBookId)
            .Select(book => new
            {
                IsOwner = book.OwnerId == userId,
                AccessLevel = book.AccessEntries
                    .Where(entry => entry.UserId == userId)
                    .Select(entry => (SongBookAccessLevel?)entry.AccessLevel)
                    .SingleOrDefault()
            })
            .SingleOrDefaultAsync();

        if (access is null)
        {
            return EffectiveSongBookAccess.None;
        }
        if (access.IsOwner)
        {
            return EffectiveSongBookAccess.Admin;
        }

        return access.AccessLevel switch
        {
            SongBookAccessLevel.Reader => EffectiveSongBookAccess.Reader,
            SongBookAccessLevel.Editor => EffectiveSongBookAccess.Editor,
            _ => EffectiveSongBookAccess.None
        };
    }
}
