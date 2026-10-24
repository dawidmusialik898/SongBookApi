using System.Globalization;
using System.Text;
using SongBookApi.Domain.Dto;

namespace SongBookApi.Domain;

public static class SongSearch
{
    public const int MaxLength = 100;

    public static string Fold(string? value)
    {
        if (string.IsNullOrEmpty(value))
        {
            return string.Empty;
        }

        string decomposed = value.ToLowerInvariant().Normalize(NormalizationForm.FormD);
        StringBuilder folded = new(decomposed.Length);
        bool appendSpace = false;
        foreach (Rune rune in decomposed.EnumerateRunes())
        {
            if (Rune.GetUnicodeCategory(rune) == UnicodeCategory.NonSpacingMark)
            {
                continue;
            }

            if (Rune.IsWhiteSpace(rune))
            {
                appendSpace = folded.Length > 0;
                continue;
            }

            if (appendSpace)
            {
                folded.Append(' ');
                appendSpace = false;
            }

            folded.Append(rune.Value == 'ł' ? "l" : rune.ToString());
        }

        return folded.ToString();
    }

    public static IReadOnlyList<string> Tokenize(string? search)
    {
        string folded = Fold(search);
        return folded.Length == 0
            ? []
            : folded.Split(' ', StringSplitOptions.RemoveEmptyEntries);
    }

    public static bool Matches(SongIndexEntry entry, IReadOnlyList<string> tokens)
    {
        if (tokens.Count == 0)
        {
            return true;
        }

        string[] fields =
        [
            Fold(entry.Title),
            Fold(entry.OriginalTitle),
            Fold(entry.Author),
            Fold(entry.Number)
        ];

        return tokens.All(token => fields.Any(field =>
            field.Contains(token, StringComparison.Ordinal)));
    }
}
