namespace SongBookApi.Domain.Services;

public sealed record PdfOptions
{
    private PdfOptions(string fontFamily, int fontSize, string orientation, int columns)
        => (FontFamily, FontSize, Orientation, Columns) = (fontFamily, fontSize, orientation, columns);

    public string FontFamily { get; }
    public int FontSize { get; }
    public string Orientation { get; }
    public int Columns { get; }
    public static PdfOptions Default { get; } = new("lato", 10, "portrait", 1);

    public static PdfOptions? Validate(
        string? fontFamily, decimal? fontSize, string? orientation, decimal? columns,
        out Dictionary<string, string[]> errors)
    {
        fontFamily ??= Default.FontFamily;
        fontSize ??= Default.FontSize;
        orientation ??= Default.Orientation;
        columns ??= Default.Columns;
        errors = [];
        if (fontFamily is not ("lato" or "dejavu-sans-mono"))
        {
            errors["fontFamily"] = ["Choose lato or dejavu-sans-mono."];
        }

        if (fontSize < 8 || fontSize > 18 || decimal.Truncate(fontSize.Value) != fontSize)
        {
            errors["fontSize"] = ["Choose an integer font size from 8 to 18."];
        }

        if (orientation is not ("portrait" or "landscape"))
        {
            errors["orientation"] = ["Choose portrait or landscape."];
        }

        int maximum = orientation == "landscape" ? 3 : 2;
        if (columns < 1 || columns > maximum || decimal.Truncate(columns.Value) != columns)
        {
            errors["columns"] = ["Choose 1-2 columns for portrait or 1-3 for landscape."];
        }

        return errors.Count == 0 ? new(fontFamily, (int)fontSize, orientation, (int)columns) : null;
    }
}