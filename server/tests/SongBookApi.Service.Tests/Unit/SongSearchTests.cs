using SongBookApi.Domain;
using SongBookApi.Domain.Dto;

namespace SongBookApi.Service.Tests.Unit;

[Trait("Category", "Unit")]
public sealed class SongSearchTests
{
    [Theory]
    [InlineData("Ślicznie Gwiazdeczko", "slicznie gwiazdeczko")]
    [InlineData("ŁÓDŹ", "lodz")]
    [InlineData(null, "")]
    [InlineData(" \t\r\n", "")]
    [InlineData("  Amazing \t  grace  ", "amazing grace")]
    public void FoldNormalizesAccentsAndWhitespace(string? value, string expected)
    {
        Assert.Equal(expected, SongSearch.Fold(value));
    }

    [Fact]
    public void TokenizeFoldsAndSplitsTheSearch()
    {
        Assert.Equal(
            new[] { "slicznie", "lodz" },
            SongSearch.Tokenize("  SLICZNIE\t  Łódź "));
    }

    [Fact]
    public void MatchesTokensAcrossFieldsAndAllowsAnEmptySearch()
    {
        SongIndexEntry entry = new(
            Guid.NewGuid(),
            "Ślicznie Gwiazdeczko",
            "Łódź hymn",
            "Elżbieta",
            "42");

        Assert.True(SongSearch.Matches(entry, SongSearch.Tokenize("slicznie elzbieta")));
        Assert.True(SongSearch.Matches(entry, SongSearch.Tokenize("42")));
        Assert.True(SongSearch.Matches(entry, SongSearch.Tokenize("lodz")));
        Assert.False(SongSearch.Matches(entry, SongSearch.Tokenize("slicznie missing")));
        Assert.True(SongSearch.Matches(entry, []));
    }
}
