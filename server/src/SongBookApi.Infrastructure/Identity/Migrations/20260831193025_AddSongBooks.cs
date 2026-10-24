using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SongBookApi.Infrastructure.Identity.Migrations
{
    /// <inheritdoc />
    public partial class AddSongBooks : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "SongBooks",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    Name = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    NormalizedName = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    OwnerId = table.Column<string>(type: "TEXT", nullable: false),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "TEXT", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SongBooks", x => x.Id);
                    table.ForeignKey(
                        name: "FK_SongBooks_AspNetUsers_OwnerId",
                        column: x => x.OwnerId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "SongBookAccessEntries",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    SongBookId = table.Column<Guid>(type: "TEXT", nullable: false),
                    UserId = table.Column<string>(type: "TEXT", nullable: false),
                    AccessLevel = table.Column<string>(type: "TEXT", maxLength: 10, nullable: false),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "TEXT", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SongBookAccessEntries", x => x.Id);
                    table.CheckConstraint("CK_SongBookAccessEntries_AccessLevel", "\"AccessLevel\" IN ('Reader', 'Editor')");
                    table.ForeignKey(
                        name: "FK_SongBookAccessEntries_AspNetUsers_UserId",
                        column: x => x.UserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_SongBookAccessEntries_SongBooks_SongBookId",
                        column: x => x.SongBookId,
                        principalTable: "SongBooks",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "Songs",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    SongBookId = table.Column<Guid>(type: "TEXT", nullable: false),
                    Title = table.Column<string>(type: "TEXT", nullable: true),
                    Author = table.Column<string>(type: "TEXT", nullable: true),
                    OriginalTitle = table.Column<string>(type: "TEXT", nullable: true),
                    Number = table.Column<string>(type: "TEXT", nullable: true),
                    Key = table.Column<string>(type: "TEXT", nullable: true),
                    Tempo = table.Column<string>(type: "TEXT", nullable: true),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "TEXT", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Songs", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Songs_SongBooks_SongBookId",
                        column: x => x.SongBookId,
                        principalTable: "SongBooks",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "Parts",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    SongId = table.Column<Guid>(type: "TEXT", nullable: false),
                    Position = table.Column<int>(type: "INTEGER", nullable: false),
                    Name = table.Column<string>(type: "TEXT", nullable: true),
                    Text = table.Column<string>(type: "TEXT", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Parts", x => x.Id);
                    table.CheckConstraint("CK_Parts_Position_NonNegative", "\"Position\" >= 0");
                    table.ForeignKey(
                        name: "FK_Parts_Songs_SongId",
                        column: x => x.SongId,
                        principalTable: "Songs",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Parts_SongId_Position",
                table: "Parts",
                columns: new[] { "SongId", "Position" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_SongBookAccessEntries_SongBookId_UserId",
                table: "SongBookAccessEntries",
                columns: new[] { "SongBookId", "UserId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_SongBookAccessEntries_UserId",
                table: "SongBookAccessEntries",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_SongBooks_OwnerId_NormalizedName",
                table: "SongBooks",
                columns: new[] { "OwnerId", "NormalizedName" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Songs_SongBookId",
                table: "Songs",
                column: "SongBookId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "Parts");

            migrationBuilder.DropTable(
                name: "SongBookAccessEntries");

            migrationBuilder.DropTable(
                name: "Songs");

            migrationBuilder.DropTable(
                name: "SongBooks");
        }
    }
}
