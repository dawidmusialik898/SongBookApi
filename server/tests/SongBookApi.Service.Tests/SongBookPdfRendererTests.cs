using SongBookApi.Domain.Dto;
using SongBookApi.Domain.Repositories;
using SongBookApi.Domain.Services;
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

        using var document = PdfDocument.Open(Render(part, includeChords: true));
        Word[] words = [.. document.GetPage(1).GetWords()];
        Letter[] chords = [.. new[] { "G", "C", "D7" }.Select(symbol => words.Single(word => word.Text == symbol).Letters[0])];
        Letter[] anchors = [.. new[] { "Amazing", "grace", "how" }.Select(lyric => words.Single(word => word.Text == lyric).Letters[0])];
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
            using var document = PdfDocument.Open(Render(part, includeChords));
            string text = ContentOrderTextExtractor.GetText(document.GetPage(1));
            Assert.Contains("Zażółć", text);
            Assert.Contains("gęślą", text);
            Assert.Equal(includeChords, text.Contains("B♭"));
        }
    }

    [Theory]
    [InlineData("lato", 8, "portrait", 1)]
    [InlineData("lato", 18, "portrait", 2)]
    [InlineData("dejavu-sans-mono", 18, "landscape", 3)]
    [InlineData("dejavu-sans-mono", 8, "landscape", 1)]
    public void OptionsChangeActualPaperFontAndTypography(
        string font, int size, string orientation, int columns)
    {
        PdfOptions options = Options(font, size, orientation, columns);
        using var document = PdfDocument.Open(Render(new Part { Text = "Bodyprobe" }, false, options));
        Page page = document.GetPage(1);
        Assert.Equal(orientation == "portrait" ? 595.28 : 841.89, page.Width, 0.5);
        Assert.Equal(orientation == "portrait" ? 841.89 : 595.28, page.Height, 0.5);
        Letter body = page.GetWords().Single(word => word.Text == "Bodyprobe").Letters[0];
        Assert.Contains(font == "lato" ? "Lato" : "DejaVuSansMono", body.FontName);
        Assert.Equal(size, body.PointSize, 0.01);
        Assert.All(page.Letters, letter =>
            Assert.True(letter.FontName?.Contains("Lato") == true || letter.FontName?.Contains("DejaVuSansMono") == true));
        AssertBounds(page, columns);
    }

    [Theory]
    [InlineData("portrait", 1, true)]
    [InlineData("portrait", 2, false)]
    [InlineData("landscape", 1, false)]
    [InlineData("landscape", 2, false)]
    [InlineData("landscape", 3, true)]
    public void LongPartsAndUnequalSongsFlowDownColumnsThenAcrossPagesWithoutLosingOrder(
        string orientation, int columns, bool chords)
    {
        PdfOptions options = Options("lato", 18, orientation, columns);
        int marker = 0;
        Song[] songs = [.. Enumerable.Range(0, 9).Select(index => new Song
        {
            Title = $"Song{index:D2}",
            Parts = [new Part
            {
                Name = $"Part{index:D2}",
                Text = string.Join("\n", Enumerable.Range(0, index % 3 == 0 ? 55 : 3)
                    .Select(_ => $"Marker{marker++:D3}"))
            }]
        })];
        using var document = PdfDocument.Open(SongBookPdfRenderer.Render(
            new SongBookPdfSnapshot("Full width book header", 0, songs), chords, DateTimeOffset.UnixEpoch, options));
        Assert.True(document.NumberOfPages > 1);
        var markers = document.GetPages().SelectMany(page => page.GetWords()
            .Where(word => word.Text.StartsWith("Marker", StringComparison.Ordinal))
            .Select(word => new { Page = page.Number, Column = ColumnAt(page, columns, word.Letters[0]), Word = word }))
            .ToArray();
        Assert.Equal(marker, markers.Length);
        Assert.Equal(Enumerable.Range(0, marker).Select(index => $"Marker{index:D3}"),
            markers.OrderBy(value => value.Page).ThenBy(value => value.Column)
                .ThenByDescending(value => value.Word.Letters[0].StartBaseLine.Y)
                .Select(value => value.Word.Text));
        Assert.Equal(Enumerable.Range(0, columns), markers.Where(value => value.Page == 1)
            .Select(value => value.Column).Distinct().Order());
        Assert.All(document.GetPages(), page =>
        {
            AssertBounds(page, columns);
            Word header = page.GetWords().Single(word => word.Text == "Full");
            Word footer = page.GetWords().Single(word => word.Text == "Page");
            Assert.Equal(SongBookPdfRenderer.Margin, header.Letters[0].StartBaseLine.X, 0.1);
            Assert.True(footer.Letters[0].StartBaseLine.X > page.Width - 120);
        });
        string text = string.Join("\n", document.GetPages().Select(page => ContentOrderTextExtractor.GetText(page)));
        foreach (Song song in songs)
        {
            Assert.Contains(song.Title!, text);
            Assert.Contains(song.Parts[0].Name!, text);
        }
    }

    [Fact]
    public void MaximumSizeThreeColumnChordsWrapOversizedSymbolsIntoAlignedRowsWithinBounds()
    {
        PdfOptions options = Options("lato", 18, "landscape", 3);
        string firstLine = "Anchor " + new string('q', 900);
        Part part = new()
        {
            Text = firstLine + "\nabc\tZażółć gęślą jaźń 🎸",
            Chords =
            [
                new Chord { Offset = 0, Symbol = new string('Z', 64) },
                new Chord { Offset = firstLine.Length + 1, Symbol = "Am7" },
                new Chord { Offset = firstLine.Length + 2, Symbol = "B♭" }
            ]
        };
        int capacity = SongBookPdfRenderer.WrapCapacity(options);
        var lines = SongBookPdfRenderer.LayoutLines(part, capacity);
        Assert.All(lines, line => Assert.All(line.ChordRows(capacity), row =>
            Assert.InRange(new System.Globalization.StringInfo(row).LengthInTextElements, 1, capacity)));
        Assert.Equal(64, string.Concat(lines.SelectMany(line => line.ChordRows(capacity))).Count(c => c == 'Z'));
        using var document = PdfDocument.Open(Render(part, true, options));
        Page first = document.GetPage(1);
        Letter anchor = first.GetWords().Single(word => word.Text == "Anchor").Letters[0];
        Letter[] symbol = [.. first.Letters.Where(letter => letter.Value == "Z" && letter.FontName?.Contains("Bold") == true)];
        Assert.Equal(64, symbol.Length);
        var rows = symbol.GroupBy(letter => letter.StartBaseLine.Y).ToArray();
        Assert.True(rows.Length >= 3);
        foreach (var row in rows)
        {
            Assert.Equal(anchor.StartBaseLine.X, row.First().StartBaseLine.X, 0.01);
            Assert.True(row.Key > anchor.StartBaseLine.Y);
        }

        Assert.Equal(16.2, anchor.PointSize, 0.01);
        Assert.Contains("DejaVuSansMono", anchor.FontName);
        Assert.Equal(900, document.GetPages().SelectMany(page => page.Letters).Count(letter => letter.Value == "q"));
        string text = string.Join("\n", document.GetPages().Select(page => ContentOrderTextExtractor.GetText(page)));
        Assert.Contains("Zażółć", text);
        Assert.Contains("gęślą", text);
        Assert.Contains("Am7", text);
        Assert.Contains("B♭", text);
        Assert.All(document.GetPages(), page => AssertBounds(page, 3));
        Word[] words = [.. document.GetPages().SelectMany(page => page.GetWords())];
        Word am = words.Single(word => word.Text == "Am7");
        Word flat = words.Single(word => word.Text == "B♭");
        Word a = words.Single(word => word.Text == "a");
        Word bc = words.Single(word => word.Text == "bc");
        Assert.Equal(a.Letters[0].StartBaseLine.X, am.Letters[0].StartBaseLine.X, 0.01);
        Assert.Equal(bc.Letters[0].StartBaseLine.X, flat.Letters[0].StartBaseLine.X, 0.01);
        Assert.Equal(am.Letters[0].StartBaseLine.Y, flat.Letters[0].StartBaseLine.Y, 0.01);
    }

    private static PdfOptions Options(string font, int size, string orientation, int columns)
        => PdfOptions.Validate(font, size, orientation, columns, out _) ?? throw new Exception("Invalid test options.");

    private static int ColumnAt(Page page, int columns, Letter letter)
    {
        double width = (page.Width - 2 * SongBookPdfRenderer.Margin -
            (columns - 1) * SongBookPdfRenderer.Gutter) / columns;
        return Math.Clamp((int)((letter.StartBaseLine.X - SongBookPdfRenderer.Margin + 0.1) /
            (width + SongBookPdfRenderer.Gutter)), 0, columns - 1);
    }

    private static void AssertBounds(Page page, int columns)
    {
        double width = (page.Width - 2 * SongBookPdfRenderer.Margin -
            (columns - 1) * SongBookPdfRenderer.Gutter) / columns;
        foreach (Letter letter in page.Letters.Where(letter => !string.IsNullOrWhiteSpace(letter.Value)))
        {
            Assert.InRange(letter.BoundingBox.Left, SongBookPdfRenderer.Margin - 1, page.Width - SongBookPdfRenderer.Margin + 1);
            Assert.InRange(letter.BoundingBox.Right, SongBookPdfRenderer.Margin - 1, page.Width - SongBookPdfRenderer.Margin + 1);
            Assert.InRange(letter.BoundingBox.Bottom, SongBookPdfRenderer.Margin - 1, page.Height - SongBookPdfRenderer.Margin + 1);
            Assert.InRange(letter.BoundingBox.Top, SongBookPdfRenderer.Margin - 1, page.Height - SongBookPdfRenderer.Margin + 1);
            if (letter.StartBaseLine.Y > 75 && letter.StartBaseLine.Y < page.Height - 85)
            {
                double left = SongBookPdfRenderer.Margin + ColumnAt(page, columns, letter) * (width + SongBookPdfRenderer.Gutter);
                Assert.InRange(letter.BoundingBox.Right, left, left + width + 1);
            }
        }
    }

    private static byte[] Render(Part part, bool includeChords, PdfOptions? options = null)
    {
        byte[] pdf = SongBookPdfRenderer.Render(
            new SongBookPdfSnapshot("Book", 0, [new Song { Title = "Probe", Parts = [part] }]),
            includeChords,
            DateTimeOffset.UnixEpoch, options);
        Assert.StartsWith("%PDF-", System.Text.Encoding.ASCII.GetString(pdf, 0, 5));
        return pdf;
    }
}