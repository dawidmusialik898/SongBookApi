using System.Text.Json;
using SongBookApi.Domain.Dto;

namespace SongBookApi.Service.Tests.Unit;

[Trait("Category", "Unit")]
public sealed class PartJsonContractTests
{
    private static readonly JsonSerializerOptions JsonOptions =
        new(JsonSerializerDefaults.Web);

    [Fact]
    public void Deserialize_WithExistingId_RestoresId()
    {
        Guid existingId = Guid.NewGuid();
        string json =
            $$"""{"id":"{{existingId}}","name":"Verse 1","text":"Existing text"}""";

        Part? part = JsonSerializer.Deserialize<Part>(json, JsonOptions);

        Assert.NotNull(part);
        Assert.Equal(existingId, part.Id);
    }

    [Fact]
    public void Deserialize_WithoutId_GeneratesId()
    {
        const string Json = """{"name":"Chorus","text":"New text"}""";

        Part? part = JsonSerializer.Deserialize<Part>(Json, JsonOptions);

        Assert.NotNull(part);
        Assert.NotEqual(Guid.Empty, part.Id);
    }
}
