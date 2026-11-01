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
    public DbSet<SongBookPdf> SongBookPdfs => Set<SongBookPdf>();
    public DbSet<Song> Songs => Set<Song>();
    public DbSet<Part> Parts => Set<Part>();
    public DbSet<Chord> Chords => Set<Chord>();
    public DbSet<BookActivity> BookActivities => Set<BookActivity>();
    public DbSet<SongRevision> SongRevisions => Set<SongRevision>();
    public DbSet<SongBookShareLink> SongBookShareLinks => Set<SongBookShareLink>();

    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);

        builder.Entity<SongBookShareLink>(entity =>
        {
            entity.HasKey(link => link.SongBookId);
            entity.Property(link => link.TokenHash).HasMaxLength(64).IsRequired();
            entity.HasIndex(link => link.TokenHash).IsUnique();
            entity.Property(link => link.CreatedAtUtc).HasConversion(
                value => value.UtcTicks, ticks => new DateTimeOffset(ticks, TimeSpan.Zero));
            entity.HasOne<SongBook>().WithMany().HasForeignKey(link => link.SongBookId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasOne<ApplicationUser>().WithMany().HasForeignKey(link => link.ActorId)
                .OnDelete(DeleteBehavior.SetNull);
        });

        builder.Entity<BookActivity>(entity =>
        {
            entity.Property(entry => entry.Operation).HasMaxLength(64).IsRequired();
            entity.Property(entry => entry.OccurredAtUtc).HasConversion(
                value => value.UtcTicks, ticks => new DateTimeOffset(ticks, TimeSpan.Zero));
            entity.HasIndex(entry => new { entry.SongBookId, entry.OccurredAtUtc, entry.Id });
            entity.HasOne<SongBook>().WithMany().HasForeignKey(entry => entry.SongBookId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasOne<ApplicationUser>().WithMany().HasForeignKey(entry => entry.ActorId)
                .OnDelete(DeleteBehavior.SetNull);
            entity.HasOne<ApplicationUser>().WithMany().HasForeignKey(entry => entry.SubjectUserId)
                .OnDelete(DeleteBehavior.SetNull);
        });
        builder.Entity<SongRevision>(entity =>
        {
            entity.Property(entry => entry.Operation).HasMaxLength(64).IsRequired();
            entity.Property(entry => entry.SnapshotJson).IsRequired();
            entity.Property(entry => entry.OccurredAtUtc).HasConversion(
                value => value.UtcTicks, ticks => new DateTimeOffset(ticks, TimeSpan.Zero));
            entity.HasIndex(entry => new { entry.SongBookId, entry.SongId, entry.Revision }).IsUnique();
            entity.HasOne<SongBook>().WithMany().HasForeignKey(entry => entry.SongBookId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasOne<ApplicationUser>().WithMany().HasForeignKey(entry => entry.ActorId)
                .OnDelete(DeleteBehavior.SetNull);
        });

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

        builder.Entity<SongBookPdf>(entity =>
        {
            entity.Property(pdf => pdf.FontFamily).HasDefaultValue("lato").IsRequired();
            entity.Property(pdf => pdf.FontSize).HasDefaultValue(10);
            entity.Property(pdf => pdf.Orientation).HasDefaultValue("portrait").IsRequired();
            entity.Property(pdf => pdf.Columns).HasDefaultValue(1);
            entity.Property(pdf => pdf.SelectedSongsJson).IsRequired();
            entity.Property(pdf => pdf.Content).IsRequired();
            entity.Property(pdf => pdf.GeneratedAtUtc).HasConversion(
                value => value.UtcTicks,
                ticks => new DateTimeOffset(ticks, TimeSpan.Zero));
            entity.HasIndex(pdf => new { pdf.SongBookId, pdf.GeneratedAtUtc });
            entity.HasOne(pdf => pdf.SongBook)
                .WithMany()
                .HasForeignKey(pdf => pdf.SongBookId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        builder.Entity<Song>(entity =>
        {
            entity.HasKey(song => song.Id);
            entity.Property(song => song.Revision).HasDefaultValue(0L).IsConcurrencyToken();
            entity.HasIndex(song => new { song.SongBookId, song.Title, song.Id });
            entity.HasMany(song => song.Parts)
                .WithOne()
                .HasForeignKey(part => part.SongId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        builder.Entity<Part>(entity =>
        {
            entity.HasKey(part => part.Id);
            entity.HasIndex(part => new { part.SongId, part.Position }).IsUnique();
            entity.HasMany(part => part.Chords)
                .WithOne()
                .HasForeignKey(chord => chord.PartId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.ToTable(table => table.HasCheckConstraint(
                "CK_Parts_Position_NonNegative",
                "\"Position\" >= 0"));
        });

        builder.Entity<Chord>(entity =>
        {
            entity.HasKey(chord => new { chord.PartId, chord.Offset });
            entity.Property(chord => chord.Symbol).HasMaxLength(64).IsRequired();
            entity.ToTable(table => table.HasCheckConstraint(
                "CK_Chords_Offset_NonNegative",
                "\"Offset\" >= 0"));
        });
    }
}