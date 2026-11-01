using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SongBookApi.Infrastructure.Identity.Migrations
{
    /// <inheritdoc />
    public partial class AddActivitySubjects : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "SubjectUserId",
                table: "BookActivities",
                type: "TEXT",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_BookActivities_SubjectUserId",
                table: "BookActivities",
                column: "SubjectUserId");

            migrationBuilder.AddForeignKey(
                name: "FK_BookActivities_AspNetUsers_SubjectUserId",
                table: "BookActivities",
                column: "SubjectUserId",
                principalTable: "AspNetUsers",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_BookActivities_AspNetUsers_SubjectUserId",
                table: "BookActivities");

            migrationBuilder.DropIndex(
                name: "IX_BookActivities_SubjectUserId",
                table: "BookActivities");

            migrationBuilder.DropColumn(
                name: "SubjectUserId",
                table: "BookActivities");
        }
    }
}
