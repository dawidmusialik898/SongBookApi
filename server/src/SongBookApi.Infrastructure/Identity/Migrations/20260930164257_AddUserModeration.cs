using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

#pragma warning disable CA1814 // Prefer jagged arrays over multidimensional

namespace SongBookApi.Infrastructure.Identity.Migrations
{
    /// <inheritdoc />
    public partial class AddUserModeration : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "IsBanned",
                table: "AspNetUsers",
                type: "INTEGER",
                nullable: false,
                defaultValue: false);

            migrationBuilder.InsertData(
                table: "AspNetRoles",
                columns: new[] { "Id", "ConcurrencyStamp", "Name", "NormalizedName" },
                values: new object[,]
                {
                    { "6e0b41f9-7922-4b8b-841c-2b533519d142", "12eb6b5b-04ec-4ed1-953a-462540057a5f", "Moderator", "MODERATOR" },
                    { "c80415e1-b317-4e0b-a397-748204b72e6b", "11ab91c7-5f71-4e37-97bd-be19b685157f", "SuperUser", "SUPERUSER" }
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DeleteData(
                table: "AspNetRoles",
                keyColumn: "Id",
                keyValue: "6e0b41f9-7922-4b8b-841c-2b533519d142");

            migrationBuilder.DeleteData(
                table: "AspNetRoles",
                keyColumn: "Id",
                keyValue: "c80415e1-b317-4e0b-a397-748204b72e6b");

            migrationBuilder.DropColumn(
                name: "IsBanned",
                table: "AspNetUsers");
        }
    }
}
