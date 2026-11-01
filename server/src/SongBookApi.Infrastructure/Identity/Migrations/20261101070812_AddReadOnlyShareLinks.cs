using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SongBookApi.Infrastructure.Identity.Migrations
{
    /// <inheritdoc />
    public partial class AddReadOnlyShareLinks : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "SongBookShareLinks",
                columns: table => new
                {
                    SongBookId = table.Column<Guid>(type: "TEXT", nullable: false),
                    TokenHash = table.Column<string>(type: "TEXT", maxLength: 64, nullable: false),
                    CreatedAtUtc = table.Column<long>(type: "INTEGER", nullable: false),
                    ActorId = table.Column<string>(type: "TEXT", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SongBookShareLinks", x => x.SongBookId);
                    table.ForeignKey(
                        name: "FK_SongBookShareLinks_AspNetUsers_ActorId",
                        column: x => x.ActorId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_SongBookShareLinks_SongBooks_SongBookId",
                        column: x => x.SongBookId,
                        principalTable: "SongBooks",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_SongBookShareLinks_ActorId",
                table: "SongBookShareLinks",
                column: "ActorId");

            migrationBuilder.CreateIndex(
                name: "IX_SongBookShareLinks_TokenHash",
                table: "SongBookShareLinks",
                column: "TokenHash",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "SongBookShareLinks");
        }
    }
}
