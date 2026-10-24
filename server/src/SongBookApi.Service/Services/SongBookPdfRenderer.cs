using System.Globalization;
using System.Text;
using QuestPDF.Drawing;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;
using SongBookApi.Domain.Dto;
using SongBookApi.Domain.Repositories;

namespace SongBookApi.Service.Services;

internal static class SongBookPdfRenderer
{
    internal const int MaxColumns = 85;
    private const string TextFont = "Lato";
    private const string MonospaceFont = "DejaVu Sans Mono";
    private const float ChordedFontSize = 9;
    private const int TabWidth = 4;
    private static readonly Color ChordColor = Color.FromHex("#1D4ED8");

    static SongBookPdfRenderer()
    {
        QuestPDF.Settings.License = LicenseType.Community;
        // Lyrics accept any Unicode text; glyphs that no bundled font covers (such as emoji)
        // become replacement characters instead of failing the whole export.
        QuestPDF.Settings.ThrowOnMissingTextGlyphs = false;
        foreach (string font in new[] { "DejaVuSansMono.ttf", "DejaVuSansMono-Bold.ttf" })
        {
            FontManager.RegisterFontFromEmbeddedResource(
                typeof(SongBookPdfRenderer).Assembly,
                $"SongBookApi.Service.Fonts.{font}");
        }
    }

    public static byte[] Render(
        SongBookPdfSnapshot snapshot,
        bool includeChords,
        DateTimeOffset generatedAtUtc) =>
        Compose(snapshot, includeChords, generatedAtUtc).GeneratePdf();

    internal static IDocument Compose(
        SongBookPdfSnapshot snapshot,
        bool includeChords,
        DateTimeOffset generatedAtUtc) =>
        Document.Create(document =>
        {
            document.Page(page =>
            {
                page.Size(PageSizes.A4);
                page.Margin(42);
                page.DefaultTextStyle(style => style.FontFamily(TextFont, MonospaceFont).FontSize(10));
                page.Header().Text(snapshot.BookName).Bold().FontSize(14);
                page.Content().PaddingVertical(16).Column(body =>
                {
                    body.Spacing(16);
                    body.Item().Text(includeChords ? "Songs with chords" : "Lyrics only")
                        .FontSize(9);
                    if (snapshot.Songs.Count == 0)
                    {
                        body.Item().Text("No songs in this book.");
                    }
                    foreach (Song song in snapshot.Songs)
                    {
                        body.Item().PreventPageBreak().Column(section =>
                            ComposeSong(section, song, includeChords));
                    }
                });
                page.Footer().Row(footer =>
                {
                    footer.RelativeItem().Text(
                        $"Generated {generatedAtUtc.UtcDateTime.ToString("yyyy-MM-dd HH:mm 'UTC'", CultureInfo.InvariantCulture)}")
                        .FontSize(8);
                    footer.AutoItem().DefaultTextStyle(style => style.FontSize(8)).Text(text =>
                    {
                        text.Span("Page ");
                        text.CurrentPageNumber();
                    });
                });
            });
        })
        .WithMetadata(new DocumentMetadata
        {
            Title = snapshot.BookName,
            CreationDate = generatedAtUtc,
            ModifiedDate = generatedAtUtc
        });

    private static void ComposeSong(ColumnDescriptor section, Song song, bool includeChords)
    {
        section.Spacing(7);
        string title = string.IsNullOrWhiteSpace(song.Title) ? "Untitled" : song.Title;
        section.Item()
            .Text(string.IsNullOrWhiteSpace(song.Number) ? title : $"{song.Number}. {title}")
            .Bold()
            .FontSize(15);
        string[] details = new[]
            {
                song.Author,
                string.IsNullOrWhiteSpace(song.OriginalTitle) ? null : $"Original: {song.OriginalTitle}",
                string.IsNullOrWhiteSpace(song.Key) ? null : $"Key: {song.Key}",
                string.IsNullOrWhiteSpace(song.Tempo) ? null : $"Tempo: {song.Tempo}"
            }
            .Where(value => !string.IsNullOrWhiteSpace(value))
            .Select(value => value!)
            .ToArray();
        if (details.Length != 0)
        {
            section.Item().Text(string.Join(" | ", details)).FontSize(9);
        }
        foreach (Part part in song.Parts.OrderBy(part => part.Position))
        {
            section.Item().PreventPageBreak().Column(block => ComposePart(block, part, includeChords));
        }
    }

    private static void ComposePart(ColumnDescriptor block, Part part, bool includeChords)
    {
        block.Spacing(includeChords ? 3 : 0);
        if (!string.IsNullOrWhiteSpace(part.Name))
        {
            block.Item().Text(part.Name).SemiBold();
        }
        if (part.Text is null)
        {
            return;
        }

        if (!includeChords)
        {
            foreach (LyricLine line in SplitLines(part.Text))
            {
                string lyrics = Printable(line.Text.Replace("\t", new string(' ', TabWidth)));
                block.Item().Text(lyrics.Length == 0 ? " " : lyrics);
            }
            return;
        }

        foreach (ChordedLine line in LayoutLines(part))
        {
            // A chord row is meaningless without the lyrics below it, so never split the pair.
            block.Item().PreventPageBreak().Column(pair =>
            {
                if (line.Chords.Count != 0)
                {
                    pair.Item().Text(line.ChordText)
                        .FontFamily(MonospaceFont, TextFont)
                        .FontSize(ChordedFontSize)
                        .FontColor(ChordColor)
                        .Bold();
                }
                pair.Item().Text(line.Lyrics.Length == 0 ? " " : line.Lyrics)
                    .FontFamily(MonospaceFont, TextFont)
                    .FontSize(ChordedFontSize);
            });
        }
    }

    // Lays chorded lyrics out on a monospace grid. Each chord starts a cell holding its lyric
    // fragment; like the browser's chord view, a cell widens when the next chord would otherwise
    // overlap its symbol, so every chord stays above its character on a single chord row.
    internal static IReadOnlyList<ChordedLine> LayoutLines(Part part)
    {
        IReadOnlyList<Chord> chords = part.Chords ?? [];
        List<ChordedLine> result = [];
        HashSet<int> placedOffsets = [];
        foreach (LyricLine line in SplitLines(part.Text ?? string.Empty))
        {
            List<string> glyphs = [];
            Dictionary<int, int> columns = [];
            TextElementEnumerator elements = StringInfo.GetTextElementEnumerator(line.Text);
            while (elements.MoveNext())
            {
                string glyph = elements.GetTextElement();
                for (int index = 0; index < glyph.Length; index++)
                {
                    columns.Add(line.Start + elements.ElementIndex + index, glyphs.Count);
                }
                if (glyph == "\t")
                {
                    glyphs.AddRange(Enumerable.Repeat(" ", TabWidth));
                }
                else
                {
                    glyphs.Add(Printable(glyph));
                }
            }

            Chord[] lineChords = chords
                .Where(chord => columns.ContainsKey(chord.Offset))
                .OrderBy(chord => chord.Offset)
                .ToArray();
            placedOffsets.UnionWith(lineChords.Select(chord => chord.Offset));
            PlacedChord[] anchors = lineChords
                .GroupBy(chord => columns[chord.Offset])
                .Select(group => new PlacedChord(
                    group.Key,
                    string.Join(" ", group.Select(chord => Printable(chord.Symbol)))))
                .OrderBy(anchor => anchor.Column)
                .ToArray();

            List<string> cells = [];
            List<PlacedChord> placed = [];
            int next = 0;
            for (int index = 0; index < anchors.Length; index++)
            {
                PlacedChord anchor = anchors[index];
                bool last = index == anchors.Length - 1;
                int end = last ? glyphs.Count : anchors[index + 1].Column;
                cells.AddRange(glyphs.GetRange(next, anchor.Column - next));
                placed.Add(anchor with { Column = cells.Count });
                cells.AddRange(glyphs.GetRange(anchor.Column, end - anchor.Column));
                if (!last)
                {
                    int missing = Width(anchor.Symbol) + 1 - (end - anchor.Column);
                    cells.AddRange(Enumerable.Repeat(" ", Math.Max(0, missing)));
                }
                next = end;
            }
            cells.AddRange(glyphs.GetRange(next, glyphs.Count - next));
            result.AddRange(Wrap(cells, placed));
        }
        if (chords.Any(chord => !placedOffsets.Contains(chord.Offset)))
        {
            throw new InvalidDataException("A saved chord has no lyric character at its offset.");
        }
        return result;
    }

    private static IEnumerable<ChordedLine> Wrap(List<string> cells, List<PlacedChord> chords)
    {
        if (cells.Count == 0)
        {
            yield return new ChordedLine(string.Empty, []);
            yield break;
        }

        int start = 0;
        while (start < cells.Count)
        {
            int end = Math.Min(start + MaxColumns, cells.Count);
            foreach (PlacedChord chord in chords)
            {
                if (chord.Column > start && chord.Column < end &&
                    chord.Column - start + Width(chord.Symbol) > MaxColumns)
                {
                    end = chord.Column;
                    break;
                }
            }
            if (end < cells.Count)
            {
                int wordEnd = end;
                while (wordEnd > start && !string.IsNullOrWhiteSpace(cells[wordEnd - 1]))
                {
                    wordEnd--;
                }
                if (wordEnd > start)
                {
                    end = wordEnd;
                }
            }

            yield return new ChordedLine(
                string.Concat(cells.GetRange(start, end - start)),
                chords
                    .Where(chord => chord.Column >= start && chord.Column < end)
                    .Select(chord => chord with { Column = chord.Column - start })
                    .ToArray());
            start = end;
        }
    }

    private static IReadOnlyList<LyricLine> SplitLines(string text)
    {
        List<LyricLine> lines = [];
        int start = 0;
        for (int index = 0; index < text.Length; index++)
        {
            if (text[index] is not ('\r' or '\n'))
            {
                continue;
            }
            lines.Add(new LyricLine(start, text[start..index]));
            if (text[index] == '\r' && index + 1 < text.Length && text[index + 1] == '\n')
            {
                index++;
            }
            start = index + 1;
        }
        lines.Add(new LyricLine(start, text[start..]));
        return lines;
    }

    // Control and separator characters would start new text lines and break chord alignment.
    private static string Printable(string value) =>
        string.Create(value.Length, value, (buffer, source) =>
        {
            for (int index = 0; index < source.Length; index++)
            {
                buffer[index] = char.IsControl(source[index]) ||
                    source[index] is '\u2028' or '\u2029'
                        ? ' '
                        : source[index];
            }
        });

    private static int Width(string value) => new StringInfo(value).LengthInTextElements;

    internal sealed record PlacedChord(int Column, string Symbol);

    internal sealed record ChordedLine(string Lyrics, IReadOnlyList<PlacedChord> Chords)
    {
        public string ChordText
        {
            get
            {
                StringBuilder text = new();
                int column = 0;
                foreach (PlacedChord chord in Chords)
                {
                    text.Append(' ', Math.Max(0, chord.Column - column));
                    text.Append(chord.Symbol);
                    column = Math.Max(column, chord.Column) + Width(chord.Symbol);
                }
                return text.ToString();
            }
        }
    }

    private sealed record LyricLine(int Start, string Text);
}
