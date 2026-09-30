using Microsoft.AspNetCore.Identity;

namespace SongBookApi.Infrastructure.Identity;

public sealed class ApplicationUser : IdentityUser
{
    public bool IsBanned { get; set; }
}
