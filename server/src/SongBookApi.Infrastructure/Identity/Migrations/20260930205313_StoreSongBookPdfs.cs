using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SongBookApi.Infrastructure.Identity.Migrations
{
    /// <inheritdoc />
    public partial class StoreSongBookPdfs : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<long>(
                name: "ContentRevision",
                table: "SongBooks",
                type: "INTEGER",
                nullable: false,
                defaultValue: 0L);

            migrationBuilder.CreateTable(
                name: "SongBookPdfs",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    SongBookId = table.Column<Guid>(type: "TEXT", nullable: false),
                    GeneratedAtUtc = table.Column<long>(type: "INTEGER", nullable: false),
                    ContentRevision = table.Column<long>(type: "INTEGER", nullable: false),
                    IncludeChords = table.Column<bool>(type: "INTEGER", nullable: false),
                    IsWholeBook = table.Column<bool>(type: "INTEGER", nullable: false),
                    SongCount = table.Column<int>(type: "INTEGER", nullable: false),
                    SelectedSongsJson = table.Column<string>(type: "TEXT", nullable: false),
                    Content = table.Column<byte[]>(type: "BLOB", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SongBookPdfs", x => x.Id);
                    table.ForeignKey(
                        name: "FK_SongBookPdfs_SongBooks_SongBookId",
                        column: x => x.SongBookId,
                        principalTable: "SongBooks",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_SongBookPdfs_SongBookId_GeneratedAtUtc",
                table: "SongBookPdfs",
                columns: new[] { "SongBookId", "GeneratedAtUtc" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "SongBookPdfs");

            migrationBuilder.DropColumn(
                name: "ContentRevision",
                table: "SongBooks");
        }
    }
}
