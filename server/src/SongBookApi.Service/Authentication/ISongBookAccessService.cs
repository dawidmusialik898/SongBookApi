using SongBookApi.Domain.Services;

namespace SongBookApi.Service.Authentication;

public interface ISongBookAccessService
{
    Task<EffectiveSongBookAccess> GetAccessAsync(Guid songBookId, string userId);
}
