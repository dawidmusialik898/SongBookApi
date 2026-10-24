using System.ComponentModel.DataAnnotations;
using Microsoft.AspNetCore.Identity;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using SongBookApi.Domain;
using SongBookApi.Domain.Entities;
using SongBookApi.Domain.Repositories;
using SongBookApi.Domain.Services;
using SongBookApi.Infrastructure.Identity;

namespace SongBookApi.Service.Services;

public sealed class SongBookService(
    ISongBookRepository repository,
    UserManager<ApplicationUser> userManager) : ISongBookService
{
    public async Task<PageResult<SongBookSummary>> ListAsync(string userId, int page)
    {
        PageResult<AccessibleSongBook> books = await repository.ListAccessibleAsync(userId, page);
        return new(books.Items.Select(ToSummary).ToArray(), books.Page, books.HasNext);
    }

    public async Task<SongBookSummary?> GetAsync(Guid bookId, string userId)
    {
        AccessibleSongBook? book = await repository.GetAccessibleAsync(bookId, userId);
        return book is null ? null : ToSummary(book);
    }

    public async Task<SongBookSummary> CreateAsync(string ownerId, string? name)
    {
        (string trimmed, string normalized) = ValidateName(name);
        if (await repository.OwnerHasNameAsync(ownerId, normalized))
        {
            throw new SongBookNameConflictException();
        }

        DateTimeOffset now = DateTimeOffset.UtcNow;
        SongBook book = new()
        {
            Id = Guid.NewGuid(),
            Name = trimmed,
            NormalizedName = normalized,
            OwnerId = ownerId,
            CreatedAtUtc = now,
            UpdatedAtUtc = now
        };

        try
        {
            await repository.AddAsync(book);
        }
        catch (DbUpdateException exception)
            when (IsUniqueConstraintViolation(exception))
        {
            throw new SongBookNameConflictException();
        }

        return new SongBookSummary(book.Id, book.Name, EffectiveSongBookAccess.Admin, 0);
    }

    public async Task RenameAsync(Guid bookId, string ownerId, string? name)
    {
        SongBook book = await GetOwnedBookAsync(bookId, ownerId);
        (string trimmed, string normalized) = ValidateName(name);
        if (await repository.OwnerHasNameAsync(ownerId, normalized, bookId))
        {
            throw new SongBookNameConflictException();
        }

        try
        {
            await repository.RenameAsync(book, trimmed, normalized, DateTimeOffset.UtcNow);
        }
        catch (DbUpdateException exception)
            when (IsUniqueConstraintViolation(exception))
        {
            throw new SongBookNameConflictException();
        }
    }

    public async Task DeleteAsync(Guid bookId, string ownerId) =>
        await repository.DeleteAsync(await GetOwnedBookAsync(bookId, ownerId));

    public async Task<PageResult<SongBookMember>> ListMembersAsync(Guid bookId, string ownerId, int page)
    {
        _ = await GetOwnedBookAsync(bookId, ownerId);
        PageResult<SongBookCollaborator> members = await repository.ListAccessAsync(bookId, page);
        return new(
            members.Items.Select(member =>
                new SongBookMember(member.Id, member.Email, member.AccessLevel)).ToArray(),
            members.Page,
            members.HasNext);
    }

    public async Task<SongBookMember?> SetAccessAsync(
        Guid bookId,
        string ownerId,
        string? email,
        SongBookAccessLevel accessLevel)
    {
        SongBook book = await GetOwnedBookAsync(bookId, ownerId);
        string exactEmail = ValidateEmail(email);
        ApplicationUser? user = await userManager.FindByEmailAsync(exactEmail);
        if (user is null)
        {
            return null;
        }
        if (user.Id == book.OwnerId)
        {
            throw new ValidationException("The song-book owner cannot be added as a collaborator.");
        }

        SongBookAccess access = await repository.UpsertAccessAsync(
            bookId,
            user.Id,
            accessLevel,
            DateTimeOffset.UtcNow);

        return new SongBookMember(access.Id, user.Email!, access.AccessLevel);
    }

    public async Task<bool> RemoveAccessAsync(Guid bookId, string ownerId, Guid accessId)
    {
        _ = await GetOwnedBookAsync(bookId, ownerId);
        return await repository.RemoveAccessAsync(bookId, accessId);
    }

    private async Task<SongBook> GetOwnedBookAsync(Guid bookId, string ownerId)
    {
        SongBook? book = await repository.GetByIdAsync(bookId);
        if (book is null)
        {
            throw new KeyNotFoundException();
        }
        if (book.OwnerId != ownerId)
        {
            throw new UnauthorizedAccessException();
        }
        return book;
    }

    private static (string Trimmed, string Normalized) ValidateName(string? name)
    {
        string trimmed = name?.Trim() ?? string.Empty;
        if (trimmed.Length is < 1 or > 100)
        {
            throw new ValidationException("Name must contain between 1 and 100 characters.");
        }
        return (trimmed, trimmed.ToUpperInvariant());
    }

    private static string ValidateEmail(string? email)
    {
        string trimmed = email?.Trim() ?? string.Empty;
        if (string.IsNullOrWhiteSpace(trimmed) || !new EmailAddressAttribute().IsValid(trimmed))
        {
            throw new ValidationException("A valid registered email is required.");
        }
        return trimmed;
    }

    private static bool IsUniqueConstraintViolation(
        DbUpdateException exception) =>
        exception.InnerException is SqliteException
        {
            SqliteExtendedErrorCode: 2067
        };

    private static SongBookSummary ToSummary(AccessibleSongBook book) =>
        new(
            book.Id,
            book.Name,
            book.AccessLevel switch
            {
                SongBookAccessLevel.Reader => EffectiveSongBookAccess.Reader,
                SongBookAccessLevel.Editor => EffectiveSongBookAccess.Editor,
                _ => EffectiveSongBookAccess.Admin
            },
            book.SongCount);
}
