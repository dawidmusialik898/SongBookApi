using SongBookApi.Domain.Dto;
using SongBookApi.Service.Services;

namespace SongBookApi.Service.Tests;

public sealed class SongBookPdfRendererTests
{
    [Fact]
    public void ChordOffsetsFollowUtf16LyricsAcrossLinesAndSurrogatePairs()
    {
        Part part = new()
        {
            Text = " A🎸m\r\nB",
            Chords =
            [
                new Chord { Offset = 0, Symbol = "G" },
                new Chord { Offset = 2, Symbol = "F#" },
                new Chord { Offset = 7, Symbol = "Am" }
            ]
        };

        IReadOnlyList<SongBookPdfRenderer.ChordedLine> lines = SongBookPdfRenderer.LayoutLines(part);
        Assert.Equal(2, lines.Count);
        Assert.Equal(" A🎸m", lines[0].Lyrics);
        Assert.Equal(new[] { 0, 2 }, lines[0].Chords.Select(chord => chord.Column));
        Assert.Equal("B", lines[1].Lyrics);
        Assert.Equal(0, lines[1].Chords.Single().Column);
    }

    [Fact]
    public void LongLyricsWrapBeforeChordSymbolsWouldRunPastThePage()
    {
        Part part = new()
        {
            Text = new string('a', 150),
            Chords = [new Chord { Offset = 83, Symbol = new string('C', 64) }]
        };

        IReadOnlyList<SongBookPdfRenderer.ChordedLine> lines = SongBookPdfRenderer.LayoutLines(part);
        Assert.Equal(part.Text, string.Concat(lines.Select(line => line.Lyrics)));
        Assert.Equal(83, lines[0].Lyrics.Length);
        Assert.Equal(0, lines[1].Chords.Single().Column);
    }
}
