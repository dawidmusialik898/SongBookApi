using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SongBookApi.Infrastructure.Identity.Migrations
{
    /// <inheritdoc />
    public partial class AddPartChords : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "Chords",
                columns: table => new
                {
                    PartId = table.Column<Guid>(type: "TEXT", nullable: false),
                    Offset = table.Column<int>(type: "INTEGER", nullable: false),
                    Symbol = table.Column<string>(type: "TEXT", maxLength: 64, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Chords", x => new { x.PartId, x.Offset });
                    table.CheckConstraint("CK_Chords_Offset_NonNegative", "\"Offset\" >= 0");
                    table.ForeignKey(
                        name: "FK_Chords_Parts_PartId",
                        column: x => x.PartId,
                        principalTable: "Parts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "Chords");
        }
    }
}
