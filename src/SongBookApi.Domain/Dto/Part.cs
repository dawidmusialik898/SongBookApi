namespace SongBookApi.Domain.Dto;

public class Part
{
    public Guid Id { get; }
    public string? Name { get; set; } //verse, chorus, intro, outro etc.
    public string? Text { get; set; }

    public Part()
    {
        Id = Guid.NewGuid();
    }
}