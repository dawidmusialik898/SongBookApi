using SongBookApi.Domain.Dto;
using SongBookApi.Domain.Repositories;
using SongBookApi.Service.Services;
using UglyToad.PdfPig;
using UglyToad.PdfPig.Content;
using UglyToad.PdfPig.DocumentLayoutAnalysis.TextExtractor;

namespace SongBookApi.Service.Tests;

public sealed class SongBookPdfRendererTests
{
    [Fact]
    public void ChordsShareOneRowAboveTheirLyricCharactersInTheBundledMonospaceFont()
    {
        Part part = new()
        {
            Text = "Amazing grace how sweet",
            Chords =
            [
                new Chord { Offset = 0, Symbol = "G" },
                new Chord { Offset = 8, Symbol = "C" },
                new Chord { Offset = 14, Symbol = "D7" }
            ]
        };

        using PdfDocument document = PdfDocument.Open(Render(part, includeChords: true));
        Word[] words = document.GetPage(1).GetWords().ToArray();
        Letter[] chords = new[] { "G", "C", "D7" }
            .Select(symbol => words.Single(word => word.Text == symbol).Letters[0])
            .ToArray();
        Letter[] anchors = new[] { "Amazing", "grace", "how" }
            .Select(lyric => words.Single(word => word.Text == lyric).Letters[0])
            .ToArray();
        foreach ((Letter chord, Letter anchor) in chords.Zip(anchors))
        {
            Assert.Equal(chords[0].StartBaseLine.Y, chord.StartBaseLine.Y, 0.01);
            Assert.True(chord.StartBaseLine.Y > anchor.StartBaseLine.Y);
            Assert.Equal(anchor.StartBaseLine.X, chord.StartBaseLine.X, 0.01);
            Assert.Contains("DejaVuSansMono", chord.FontName);
            Assert.Contains("DejaVuSansMono", anchor.FontName);
        }
    }

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
        Assert.Equal("G F#", lines[0].ChordText);
        Assert.Equal("B", lines[1].Lyrics);
        Assert.Equal(0, lines[1].Chords.Single().Column);
    }

    [Fact]
    public void CloseChordsWidenTheirLyricCellsInsteadOfOverlapping()
    {
        Part part = new()
        {
            Text = "abc",
            Chords =
            [
                new Chord { Offset = 0, Symbol = "Am7" },
                new Chord { Offset = 1, Symbol = "D" }
            ]
        };

        SongBookPdfRenderer.ChordedLine line = Assert.Single(SongBookPdfRenderer.LayoutLines(part));
        Assert.Equal("a   bc", line.Lyrics);
        Assert.Equal("Am7 D", line.ChordText);
        Assert.Equal(new[] { 0, 4 }, line.Chords.Select(chord => chord.Column));
    }

    [Fact]
    public void LongLinesWrapBetweenWordsAndKeepChordsOverTheirCharacters()
    {
        string text = string.Join(" ", Enumerable.Repeat("lorem ipsum dolor", 9));
        int offset = text.IndexOf("dolor", 80, StringComparison.Ordinal) + 1;
        Part part = new()
        {
            Text = text,
            Chords = [new Chord { Offset = offset, Symbol = "E" }]
        };

        IReadOnlyList<SongBookPdfRenderer.ChordedLine> lines = SongBookPdfRenderer.LayoutLines(part);
        Assert.Equal(text, string.Concat(lines.Select(line => line.Lyrics)));
        Assert.All(lines, line => Assert.InRange(line.Lyrics.Length, 1, SongBookPdfRenderer.MaxColumns));
        Assert.All(lines.SkipLast(1), line => Assert.EndsWith(" ", line.Lyrics));
        SongBookPdfRenderer.ChordedLine chorded = Assert.Single(lines, line => line.Chords.Count != 0);
        Assert.Equal('o', chorded.Lyrics[chorded.Chords.Single().Column]);
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

    [Fact]
    public void UncoveredGlyphsTabsAndControlCharactersStillProducePdfs()
    {
        Part part = new()
        {
            Name = "Zwrotka 🎸",
            Text = "Zażółć\tgęślą 🎸 漢字",
            Chords =
            [
                new Chord { Offset = 0, Symbol = "C\nD" },
                new Chord { Offset = 7, Symbol = "B♭" }
            ]
        };

        SongBookPdfRenderer.ChordedLine line = Assert.Single(SongBookPdfRenderer.LayoutLines(part));
        Assert.Equal("Zażółć    gęślą 🎸 漢字", line.Lyrics);
        Assert.Equal("C D       B♭", line.ChordText);
        foreach (bool includeChords in new[] { true, false })
        {
            using PdfDocument document = PdfDocument.Open(Render(part, includeChords));
            string text = ContentOrderTextExtractor.GetText(document.GetPage(1));
            Assert.Contains("Zażółć", text);
            Assert.Contains("gęślą", text);
            Assert.Equal(includeChords, text.Contains("B♭"));
        }
    }

    private static byte[] Render(Part part, bool includeChords)
    {
        byte[] pdf = SongBookPdfRenderer.Render(
            new SongBookPdfSnapshot("Book", 0, [new Song { Title = "Probe", Parts = [part] }]),
            includeChords,
            DateTimeOffset.UnixEpoch);
        Assert.StartsWith("%PDF-", System.Text.Encoding.ASCII.GetString(pdf, 0, 5));
        return pdf;
    }
}
