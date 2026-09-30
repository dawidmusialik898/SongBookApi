namespace SongBookApi.Domain;

public sealed record PageResult<T>(
    IReadOnlyList<T> Items,
    int Page,
    bool HasNext);

public static class Paging
{
    public const int Size = 50;

    public static bool IsValid(int page) =>
        page >= 1 && (long)(page - 1) * Size <= int.MaxValue;

    public static int Offset(int page) => (page - 1) * Size;

    public static PageResult<T> FromLookahead<T>(
        IReadOnlyList<T> results,
        int page) =>
        new(results.Take(Size).ToArray(), page, results.Count > Size);
}
