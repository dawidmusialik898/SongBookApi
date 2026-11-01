using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SongBookApi.Infrastructure.Identity.Migrations
{
    /// <inheritdoc />
    public partial class AddPdfCustomization : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "Columns",
                table: "SongBookPdfs",
                type: "INTEGER",
                nullable: false,
                defaultValue: 1);

            migrationBuilder.AddColumn<string>(
                name: "FontFamily",
                table: "SongBookPdfs",
                type: "TEXT",
                nullable: false,
                defaultValue: "lato");

            migrationBuilder.AddColumn<int>(
                name: "FontSize",
                table: "SongBookPdfs",
                type: "INTEGER",
                nullable: false,
                defaultValue: 10);

            migrationBuilder.AddColumn<string>(
                name: "Orientation",
                table: "SongBookPdfs",
                type: "TEXT",
                nullable: false,
                defaultValue: "portrait");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Columns",
                table: "SongBookPdfs");

            migrationBuilder.DropColumn(
                name: "FontFamily",
                table: "SongBookPdfs");

            migrationBuilder.DropColumn(
                name: "FontSize",
                table: "SongBookPdfs");

            migrationBuilder.DropColumn(
                name: "Orientation",
                table: "SongBookPdfs");
        }
    }
}
