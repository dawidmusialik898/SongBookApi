using SongBookService.API.Models;

using System.Collections.Generic;

namespace SongBookService.API.DbInitializers
{
    public interface ISongDbInitializer
    {
        IEnumerable<Song> GetSongs();
    }
}
