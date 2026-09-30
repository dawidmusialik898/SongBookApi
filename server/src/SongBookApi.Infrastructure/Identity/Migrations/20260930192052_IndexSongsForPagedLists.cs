using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SongBookApi.Infrastructure.Identity.Migrations
{
    /// <inheritdoc />
    public partial class IndexSongsForPagedLists : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Songs_SongBookId",
                table: "Songs");

            migrationBuilder.CreateIndex(
                name: "IX_Songs_SongBookId_Title_Id",
                table: "Songs",
                columns: new[] { "SongBookId", "Title", "Id" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Songs_SongBookId_Title_Id",
                table: "Songs");

            migrationBuilder.CreateIndex(
                name: "IX_Songs_SongBookId",
                table: "Songs",
                column: "SongBookId");
        }
    }
}
