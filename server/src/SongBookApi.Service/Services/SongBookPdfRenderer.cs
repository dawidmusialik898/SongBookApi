using System.Globalization;
using System.Text;
using QuestPDF.Drawing;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;
using SongBookApi.Domain.Dto;
using SongBookApi.Domain.Repositories;
using SongBookApi.Domain.Services;

namespace SongBookApi.Service.Services;

internal static class SongBookPdfRenderer
{
    internal const int MaxColumns = 85;
    private const string TextFont = "Lato";
    private const string MonospaceFont = "DejaVu Sans Mono";
    private const float ChordedFontSize = 9;
    internal const float Margin = 42;
    internal const float Gutter = 18;
    // Both bundled DejaVu Sans Mono faces have a 1233/2048-em cell advance.
    private const float MonospaceAdvance = 1233f / 2048;
    private const int TabWidth = 4;
    private static readonly Color ChordColor = Color.FromHex("#1D4ED8");

    static SongBookPdfRenderer()
    {
        QuestPDF.Settings.License = LicenseType.Community;
        QuestPDF.Settings.UseSystemFonts = false;
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
        DateTimeOffset generatedAtUtc,
        PdfOptions? options = null)
        => Compose(snapshot, includeChords, generatedAtUtc, options).GeneratePdf();

    internal static IDocument Compose(
        SongBookPdfSnapshot snapshot,
        bool includeChords,
        DateTimeOffset generatedAtUtc,
        PdfOptions? options = null)
    {
        options ??= PdfOptions.Default;
        float scale = options.FontSize / 10f;
        string font = options.FontFamily == "lato" ? TextFont : MonospaceFont;
        int capacity = WrapCapacity(options);
        return Document.Create(document =>
        {
            document.Page(page =>
            {
                page.Size(options.Orientation == "landscape" ? PageSizes.A4.Landscape() : PageSizes.A4);
                page.Margin(Margin);
                page.DefaultTextStyle(style => style.FontFamily(font, MonospaceFont).FontSize(options.FontSize));
                page.Header().Text(snapshot.BookName).Bold().FontSize(14 * scale);
                IContainer content = page.Content().PaddingVertical(16);
                void ComposeBody(ColumnDescriptor body)
                {
                    body.Spacing(16 * scale);
                    body.Item().Text(includeChords ? "Songs with chords" : "Lyrics only")
                        .FontSize(9 * scale);
                    if (snapshot.Songs.Count == 0)
                    {
                        body.Item().Text("No songs in this book.");
                    }

                    foreach (Song song in snapshot.Songs)
                    {
                        IContainer section = EstimatedSongHeight(song, includeChords, scale, capacity) <= 180
                            ? body.Item().PreventPageBreak()
                            : body.Item().EnsureSpace(45 * scale);
                        section.Column(column =>
                            ComposeSong(column, song, includeChords, scale, capacity));
                    }
                }

                if (options.Columns == 1)
                {
                    content.Column(ComposeBody);
                }
                else
                {
                    content.MultiColumn(columns =>
                    {
                        columns.Columns(options.Columns);
                        columns.Spacing(Gutter);
                        columns.BalanceHeight(false);
                        columns.Content().Column(ComposeBody);
                    });
                }
                page.Footer().Row(footer =>
                {
                    footer.RelativeItem().Text(
                        $"Generated {generatedAtUtc.UtcDateTime.ToString("yyyy-MM-dd HH:mm 'UTC'", CultureInfo.InvariantCulture)}")
                        .FontSize(8 * scale);
                    footer.AutoItem().DefaultTextStyle(style => style.FontSize(8 * scale)).Text(text =>
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
    }

    internal static int WrapCapacity(PdfOptions options)
    {
        if (options.Orientation == "portrait" && options.Columns == 1 && options.FontSize == 10)
        {
            return MaxColumns;
        }

        float width = options.Orientation == "landscape" ? PageSizes.A4.Height : PageSizes.A4.Width;
        float usable = (width - 2 * Margin - (options.Columns - 1) * Gutter) / options.Columns;
        return Math.Max(1, (int)Math.Floor((usable - 1) / (ChordedFontSize * options.FontSize / 10f * MonospaceAdvance)));
    }

    private static void ComposeSong(
        ColumnDescriptor section, Song song, bool includeChords, float scale, int capacity)
    {
        section.Spacing(7 * scale);
        string title = string.IsNullOrWhiteSpace(song.Title) ? "Untitled" : song.Title;
        section.Item()
            .Text(string.IsNullOrWhiteSpace(song.Number) ? title : $"{song.Number}. {title}")
            .Bold()
            .FontSize(15 * scale);
        string[] details = [.. new[]
            {
                song.Author,
                string.IsNullOrWhiteSpace(song.OriginalTitle) ? null : $"Original: {song.OriginalTitle}",
                string.IsNullOrWhiteSpace(song.Key) ? null : $"Key: {song.Key}",
                string.IsNullOrWhiteSpace(song.Tempo) ? null : $"Tempo: {song.Tempo}"
            }
            .Where(value => !string.IsNullOrWhiteSpace(value))
            .Select(value => value!)];
        if (details.Length != 0)
        {
            section.Item().Text(string.Join(" | ", details)).FontSize(9 * scale);
        }

        foreach (Part part in song.Parts.OrderBy(part => part.Position))
        {
            // In MultiColumn, page-based prevention can skip every column for a long part.
            // Reserve a bounded heading/lyric start instead; the remainder can flow freely.
            IContainer block = EstimatedPartHeight(part, includeChords, scale, capacity) > 180
                ? section.Item().EnsureSpace(25 * scale)
                : section.Item().PreventPageBreak();
            block.Column(column => ComposePart(column, part, includeChords, scale, capacity));
        }
    }

    // Conservative bounds retain compact groups without asking page-based prevention to keep
    // an entire long song/part together in every column on its first page.
    private static float EstimatedSongHeight(Song song, bool includeChords, float scale, int capacity)
    {
        int headingCapacity = Math.Max(1, capacity / 3);
        int headingRows = 1 + Width(song.Title ?? string.Empty) / headingCapacity;
        int metadataLength = Width(string.Join(" ", song.Author, song.Number, song.OriginalTitle, song.Key, song.Tempo));
        return (headingRows * 24 + (1 + metadataLength / headingCapacity) * 16 + 20) * scale +
            song.Parts.Sum(part => EstimatedPartHeight(part, includeChords, scale, capacity) + 7 * scale);
    }

    private static float EstimatedPartHeight(Part part, bool includeChords, float scale, int capacity)
    {
        int rows = includeChords
            ? LayoutLines(part, capacity).Sum(line => 1 + line.ChordRows(capacity).Count())
            : SplitLines(part.Text ?? string.Empty).Sum(line =>
                1 + Width(line.Text.Replace("\t", new string(' ', TabWidth))) / Math.Max(1, capacity / 2));
        int nameRows = string.IsNullOrEmpty(part.Name) ? 0 : 1 + Width(part.Name) / Math.Max(1, capacity / 2);
        return (rows * 16 + nameRows * 16 + 6) * scale;
    }

    private static void ComposePart(
        ColumnDescriptor block, Part part, bool includeChords, float scale, int capacity)
    {
        block.Spacing(includeChords ? 3 * scale : 0);
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

        foreach (ChordedLine line in LayoutLines(part, capacity))
        {
            // A chord row is meaningless without the lyrics below it, so never split the pair.
            block.Item().PreventPageBreak().Column(pair =>
            {
                foreach (string chordRow in line.ChordRows(capacity))
                {
                    pair.Item().Text(chordRow)
                        .FontFamily(MonospaceFont)
                        .FontSize(ChordedFontSize * scale)
                        .FontColor(ChordColor)
                        .Bold();
                }

                pair.Item().Text(line.Lyrics.Length == 0 ? " " : line.Lyrics)
                    .FontFamily(MonospaceFont)
                    .FontSize(ChordedFontSize * scale);
            });
        }
    }

    // Lays chorded lyrics out on a monospace grid. Each chord starts a cell holding its lyric
    // fragment; like the browser's chord view, a cell widens when the next chord would otherwise
    // overlap its symbol, so every chord stays above its character on a single chord row.
    internal static IReadOnlyList<ChordedLine> LayoutLines(Part part, int capacity = MaxColumns)
    {
        ArgumentOutOfRangeException.ThrowIfLessThan(capacity, 1);
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

            Chord[] lineChords = [.. chords
                .Where(chord => columns.ContainsKey(chord.Offset))
                .OrderBy(chord => chord.Offset)];
            placedOffsets.UnionWith(lineChords.Select(chord => chord.Offset));
            PlacedChord[] anchors = [.. lineChords
                .GroupBy(chord => columns[chord.Offset])
                .Select(group => new PlacedChord(
                    group.Key,
                    string.Join(" ", group.Select(chord => Printable(chord.Symbol)))))
                .OrderBy(anchor => anchor.Column)];

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
            result.AddRange(Wrap(cells, placed, capacity));
        }

        if (chords.Any(chord => !placedOffsets.Contains(chord.Offset)))
        {
            throw new InvalidDataException("A saved chord has no lyric character at its offset.");
        }

        return result;
    }

    private static IEnumerable<ChordedLine> Wrap(List<string> cells, List<PlacedChord> chords, int capacity)
    {
        if (cells.Count == 0)
        {
            yield return new ChordedLine(string.Empty, []);
            yield break;
        }

        int start = 0;
        while (start < cells.Count)
        {
            int end = Math.Min(start + capacity, cells.Count);
            foreach (PlacedChord chord in chords)
            {
                if (chord.Column > start && chord.Column < end &&
                    chord.Column - start + Width(chord.Symbol) > capacity)
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
    private static string Printable(string value)
        => string.Create(value.Length, value, (buffer, source) =>
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
        public IEnumerable<string> ChordRows(int capacity)
        {
            List<List<PlacedChord>> rows = [];
            foreach (PlacedChord chord in Chords)
            {
                string[] glyphs = TextElements(chord.Symbol);
                int available = capacity - chord.Column;
                for (int start = 0, row = 0; start < glyphs.Length; start += available, row++)
                {
                    while (rows.Count <= row)
                    {
                        rows.Add([]);
                    }

                    rows[row].Add(new(chord.Column, string.Concat(glyphs.Skip(start).Take(available))));
                }
            }

            return rows.Select(row => new ChordedLine(string.Empty, row).ChordText);
        }

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

    private static string[] TextElements(string text)
    {
        List<string> glyphs = [];
        TextElementEnumerator elements = StringInfo.GetTextElementEnumerator(text);
        while (elements.MoveNext())
        {
            glyphs.Add(elements.GetTextElement());
        }

        return [.. glyphs];
    }

    private sealed record LyricLine(int Start, string Text);
}