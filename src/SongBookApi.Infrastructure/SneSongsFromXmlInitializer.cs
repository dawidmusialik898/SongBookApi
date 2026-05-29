using SongBookApi.Domain.Dto;
using System.Xml;

namespace SongBookApi.Infrastructure;

public class SneSongsFromXmlSeeder : ISongDbSeeder
{
    private const string _filepath = "snesongs.xml";
    public IEnumerable<Song> GetSongs()
    {
        if (!File.Exists(_filepath))
        {
            throw new InvalidDataException(Path.GetFullPath(_filepath));
        }

        XmlDocument doc = new();
        doc.Load(_filepath);
        XmlNodeList? xmlSongs = doc.DocumentElement.SelectNodes(@"//SlideGroup");
        var songs = new Song[xmlSongs.Count];
        for (int i = 0; i < xmlSongs.Count; i++)
        {
            songs[i] = GetSong(xmlSongs[i]);
        }

        return songs;
    }
    private static Song GetSong(XmlNode xmlSong)
        => new()
        {
            Author = null,
            Key = "",
            OriginalTitle = null,
            Number = xmlSong.SelectSingleNode(@".//Number")?.InnerText,
            Title = xmlSong.SelectSingleNode(@".//Title")?.InnerText,
            Parts = GetParts(xmlSong.SelectNodes(@".//Slide")),
        };

    private static Part[] GetParts(XmlNodeList parts)
        => parts.Cast<XmlNode>().Select(p =>
            new Part()
            {
                Name = p.SelectSingleNode(@".//Part")?.InnerText,
                Text = p.SelectSingleNode(@".//Text")?.InnerText
            }).ToArray();
}

public interface ISongDbSeeder
{
}