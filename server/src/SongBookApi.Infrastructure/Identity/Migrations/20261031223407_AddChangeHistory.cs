using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SongBookApi.Infrastructure.Identity.Migrations
{
    /// <inheritdoc />
    public partial class AddChangeHistory : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<long>(
                name: "Revision",
                table: "Songs",
                type: "INTEGER",
                nullable: false,
                defaultValue: 0L);

            migrationBuilder.CreateTable(
                name: "BookActivities",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    SongBookId = table.Column<Guid>(type: "TEXT", nullable: false),
                    SongId = table.Column<Guid>(type: "TEXT", nullable: true),
                    Revision = table.Column<long>(type: "INTEGER", nullable: true),
                    Operation = table.Column<string>(type: "TEXT", maxLength: 64, nullable: false),
                    OccurredAtUtc = table.Column<long>(type: "INTEGER", nullable: false),
                    ActorId = table.Column<string>(type: "TEXT", nullable: true),
                    OwnerOnly = table.Column<bool>(type: "INTEGER", nullable: false),
                    Description = table.Column<string>(type: "TEXT", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_BookActivities", x => x.Id);
                    table.ForeignKey(
                        name: "FK_BookActivities_AspNetUsers_ActorId",
                        column: x => x.ActorId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_BookActivities_SongBooks_SongBookId",
                        column: x => x.SongBookId,
                        principalTable: "SongBooks",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "SongRevisions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    SongBookId = table.Column<Guid>(type: "TEXT", nullable: false),
                    SongId = table.Column<Guid>(type: "TEXT", nullable: false),
                    Revision = table.Column<long>(type: "INTEGER", nullable: false),
                    Operation = table.Column<string>(type: "TEXT", maxLength: 64, nullable: false),
                    OccurredAtUtc = table.Column<long>(type: "INTEGER", nullable: false),
                    ActorId = table.Column<string>(type: "TEXT", nullable: true),
                    RestoredFromRevision = table.Column<long>(type: "INTEGER", nullable: true),
                    SnapshotJson = table.Column<string>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SongRevisions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_SongRevisions_AspNetUsers_ActorId",
                        column: x => x.ActorId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_SongRevisions_SongBooks_SongBookId",
                        column: x => x.SongBookId,
                        principalTable: "SongBooks",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_BookActivities_ActorId",
                table: "BookActivities",
                column: "ActorId");

            migrationBuilder.CreateIndex(
                name: "IX_BookActivities_SongBookId_OccurredAtUtc_Id",
                table: "BookActivities",
                columns: new[] { "SongBookId", "OccurredAtUtc", "Id" });

            migrationBuilder.CreateIndex(
                name: "IX_SongRevisions_ActorId",
                table: "SongRevisions",
                column: "ActorId");

            migrationBuilder.CreateIndex(
                name: "IX_SongRevisions_SongBookId_SongId_Revision",
                table: "SongRevisions",
                columns: new[] { "SongBookId", "SongId", "Revision" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "BookActivities");

            migrationBuilder.DropTable(
                name: "SongRevisions");

            migrationBuilder.DropColumn(
                name: "Revision",
                table: "Songs");
        }
    }
}
