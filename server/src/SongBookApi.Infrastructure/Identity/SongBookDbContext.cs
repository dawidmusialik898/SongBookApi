using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;
using SongBookApi.Domain.Dto;
using SongBookApi.Domain.Entities;

namespace SongBookApi.Infrastructure.Identity;

public sealed class SongBookDbContext(DbContextOptions<SongBookDbContext> options)
    : IdentityDbContext<ApplicationUser>(options)
{
    public DbSet<SongBook> SongBooks => Set<SongBook>();
    public DbSet<SongBookAccess> SongBookAccessEntries => Set<SongBookAccess>();
    public DbSet<Song> Songs => Set<Song>();
    public DbSet<Part> Parts => Set<Part>();

    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);

        builder.Entity<IdentityRole>().HasData(
            new IdentityRole
            {
                Id = "c80415e1-b317-4e0b-a397-748204b72e6b",
                Name = "SuperUser",
                NormalizedName = "SUPERUSER",
                ConcurrencyStamp = "11ab91c7-5f71-4e37-97bd-be19b685157f"
            },
            new IdentityRole
            {
                Id = "6e0b41f9-7922-4b8b-841c-2b533519d142",
                Name = "Moderator",
                NormalizedName = "MODERATOR",
                ConcurrencyStamp = "12eb6b5b-04ec-4ed1-953a-462540057a5f"
            });

        builder.Entity<SongBook>(entity =>
        {
            entity.Property(book => book.Name).HasMaxLength(100).IsRequired();
            entity.Property(book => book.NormalizedName).HasMaxLength(100).IsRequired();
            entity.Property(book => book.OwnerId).IsRequired();
            entity.HasIndex(book => new { book.OwnerId, book.NormalizedName }).IsUnique();
            entity.HasOne<ApplicationUser>()
                .WithMany()
                .HasForeignKey(book => book.OwnerId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasMany(book => book.Songs)
                .WithOne()
                .HasForeignKey(song => song.SongBookId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasMany(book => book.AccessEntries)
                .WithOne(access => access.SongBook)
                .HasForeignKey(access => access.SongBookId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        builder.Entity<SongBookAccess>(entity =>
        {
            entity.HasIndex(access => new { access.SongBookId, access.UserId }).IsUnique();
            entity.Property(access => access.UserId).IsRequired();
            entity.Property(access => access.AccessLevel).HasConversion<string>().HasMaxLength(10);
            entity.ToTable(table => table.HasCheckConstraint(
                "CK_SongBookAccessEntries_AccessLevel",
                "\"AccessLevel\" IN ('Reader', 'Editor')"));
            entity.HasOne<ApplicationUser>()
                .WithMany()
                .HasForeignKey(access => access.UserId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        builder.Entity<Song>(entity =>
        {
            entity.HasKey(song => song.Id);
            entity.HasMany(song => song.Parts)
                .WithOne()
                .HasForeignKey(part => part.SongId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        builder.Entity<Part>(entity =>
        {
            entity.HasKey(part => part.Id);
            entity.HasIndex(part => new { part.SongId, part.Position }).IsUnique();
            entity.ToTable(table => table.HasCheckConstraint(
                "CK_Parts_Position_NonNegative",
                "\"Position\" >= 0"));
        });
    }
}
