using System.Collections.Generic;
using SongBookApi.Domain.Dto;

namespace SongBookApi.Domain.Interfaces;

public interface ISongDbSeeder
{
    IEnumerable<Song> GetSongs();
}