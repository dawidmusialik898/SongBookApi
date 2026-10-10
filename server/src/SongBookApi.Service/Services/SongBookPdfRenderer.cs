using System.Globalization;
using SongBookApi.Domain.Dto;
using SongBookApi.Domain.Repositories;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

namespace SongBookApi.Service.Services;

internal static class SongBookPdfRenderer
{
    private const string ChordFont = "DejaVu Sans Mono";
    private const float ChordFontSize = 9;
    private const float ChordCharacterWidth = 5.42f;
    private const int MaxColumns = 85;

    public static byte[] Render(
        SongBookPdfSnapshot snapshot,
        bool includeChords,
        DateTimeOffset generatedAtUtc) =>
        Document.Create(document =>
        {
            document.Page(page =>
            {
                page.Size(PageSizes.A4);
                page.Margin(42);
                page.DefaultTextStyle(style => style.FontFamily("Lato").FontSize(10));
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
                        body.Item().Column(section =>
                        {
                            section.Spacing(7);
                            string title = string.IsNullOrWhiteSpace(song.Title)
                                ? "Untitled"
                                : song.Title;
                            section.Item().Text(string.IsNullOrWhiteSpace(song.Number)
                                    ? title
                                    : $"{song.Number}. {title}")
                                .Bold().FontSize(15);
                            string[] details = new[]
                                {
                                    song.Author,
                                    song.OriginalTitle is null ? null : $"Original: {song.OriginalTitle}",
                                    song.Key is null ? null : $"Key: {song.Key}",
                                    song.Tempo is null ? null : $"Tempo: {song.Tempo}"
                                }
                                .Where(value => !string.IsNullOrWhiteSpace(value))
                                .Select(value => value!)
                                .ToArray();
                            if (details.Length != 0)
                            {
                                section.Item().Text(string.Join(" | ", details))
                                    .FontSize(9);
                            }
                            foreach (Part part in song.Parts.OrderBy(part => part.Position))
                            {
                                if (!string.IsNullOrWhiteSpace(part.Name))
                                {
                                    section.Item().Text(part.Name).SemiBold();
                                }
                                if (part.Text is not null)
                                {
                                    if (includeChords)
                                    {
                                        foreach (ChordedLine line in LayoutLines(part))
                                        {
                                            section.Item().Column(lines =>
                                            {
                                                lines.Spacing(0);
                                                foreach (PlacedChord chord in line.Chords)
                                                {
                                                    lines.Item().Row(row =>
                                                    {
                                                        if (chord.Column > 0)
                                                        {
                                                            row.ConstantItem(
                                                                chord.Column * ChordCharacterWidth);
                                                        }
                                                        row.RelativeItem().Text(chord.Symbol)
                                                            .FontFamily(ChordFont)
                                                            .FontSize(ChordFontSize)
                                                            .Bold();
                                                    });
                                                }
                                                lines.Item().Text(
                                                        line.Lyrics.Length == 0 ? " " : line.Lyrics)
                                                    .FontFamily(ChordFont)
                                                    .FontSize(ChordFontSize);
                                            });
                                        }
                                    }
                                    else
                                    {
                                        foreach (LyricLine line in SplitLines(part.Text))
                                        {
                                            section.Item().Text(
                                                line.Text.Length == 0 ? " " : line.Text);
                                        }
                                    }
                                }
                            }
                        });
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
        }).GeneratePdf();

    internal static IReadOnlyList<ChordedLine> LayoutLines(Part part)
    {
        List<ChordedLine> result = [];
        HashSet<int> placedOffsets = [];
        foreach (LyricLine line in SplitLines(part.Text ?? string.Empty))
        {
            List<string> glyphs = [];
            Dictionary<int, int> columns = [];
            TextElementEnumerator elements = StringInfo.GetTextElementEnumerator(line.Text);
            while (elements.MoveNext())
            {
                int offset = line.Start + elements.ElementIndex;
                string glyph = elements.GetTextElement();
                for (int index = 0; index < glyph.Length; index++)
                {
                    columns.Add(offset + index, glyphs.Count);
                }
                if (glyph == "\t")
                {
                    glyphs.AddRange([" ", " ", " ", " "]);
                }
                else
                {
                    glyphs.Add(glyph);
                }
            }

            var chords = (part.Chords ?? [])
                .Where(chord => columns.ContainsKey(chord.Offset))
                .Select(chord =>
                {
                    placedOffsets.Add(chord.Offset);
                    return new PlacedChord(columns[chord.Offset], chord.Symbol);
                })
                .OrderBy(chord => chord.Column)
                .ToArray();
            if (glyphs.Count == 0)
            {
                result.Add(new ChordedLine(string.Empty, []));
                continue;
            }

            int start = 0;
            while (start < glyphs.Count)
            {
                int end = Math.Min(start + MaxColumns, glyphs.Count);
                foreach (PlacedChord chord in chords)
                {
                    if (chord.Column >= start && chord.Column < end &&
                        chord.Column - start + chord.Symbol.Length > MaxColumns)
                    {
                        end = chord.Column;
                        break;
                    }
                }

                result.Add(new ChordedLine(
                    string.Concat(glyphs.GetRange(start, end - start)),
                    chords
                        .Where(chord => chord.Column >= start && chord.Column < end)
                        .Select(chord => chord with { Column = chord.Column - start })
                        .ToArray()));
                start = end;
            }
        }
        if (part.Chords?.Any(chord => !placedOffsets.Contains(chord.Offset)) == true)
        {
            throw new InvalidDataException("A saved chord has no lyric character at its offset.");
        }
        return result;
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

    internal sealed record PlacedChord(int Column, string Symbol);
    internal sealed record ChordedLine(string Lyrics, IReadOnlyList<PlacedChord> Chords);
    private sealed record LyricLine(int Start, string Text);
}
