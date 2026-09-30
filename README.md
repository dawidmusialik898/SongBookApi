# SongBook API

ASP.NET Core API for private, persistent song books. Identity users, books,
collaborator access, songs, ordered parts, and timestamps are stored together
in the SQLite database at `src/SongBookApi.Service/App_Data/songbook.db`.

## Run locally

```sh
dotnet dev-certs https --trust
dotnet run \
  --project src/SongBookApi.Service/SongBookApi.Service.csproj \
  --launch-profile https
```

The Development HTTPS origin is `https://localhost:7152`. The API also serves
the sibling `SongBookClient` entry page and static assets from that origin.
Migrations are applied automatically at startup. Development confirmation and
password-reset links are logged; a production email sender is not configured.

## Authentication and antiforgery

All `/songbooks` and nested song routes require a confirmed, authenticated
Identity session. Anonymous requests return `401`. Obtain a request token from
`GET /auth/antiforgery` and send it as `X-CSRF-TOKEN` on every
`POST`, `PUT`, and `DELETE`. Cookie authentication never redirects API callers.

Account routes remain:

- `GET /auth/me`
- `GET /auth/antiforgery`
- `POST /auth/register`
- `GET /auth/confirm-email`
- `POST /auth/resend-confirmation`
- `POST /auth/login`
- `POST /auth/logout`
- `POST /auth/forgot-password`
- `POST /auth/reset-password`

## Song-book contract

| Method | Path | Minimum access | Success |
| --- | --- | --- | --- |
| `GET` | `/songbooks` | Authenticated | `200` summaries |
| `POST` | `/songbooks` | Authenticated | `201` summary |
| `GET` | `/songbooks/{bookId}` | Reader | `200` summary/detail |
| `PUT` | `/songbooks/{bookId}` | Admin | `204` |
| `DELETE` | `/songbooks/{bookId}` | Admin | `204` |
| `GET` | `/songbooks/{bookId}/access` | Admin | `200` collaborators |
| `PUT` | `/songbooks/{bookId}/access` | Admin | `200` collaborator |
| `DELETE` | `/songbooks/{bookId}/access/{accessId}` | Admin | `204` |

Create and rename bodies:

```json
{ "name": "Sunday Service" }
```

Names are trimmed, must contain 1-100 characters, and are unique per owner
after invariant case normalization. Duplicate names return `409`.

Summary/detail response:

```json
{
  "id": "book-guid",
  "name": "Sunday Service",
  "accessLevel": "admin",
  "songCount": 12
}
```

Set collaborator access by the exact email of an existing registered user:

```json
{
  "email": "reader@example.com",
  "accessLevel": "reader"
}
```

Only `reader` and `editor` are accepted. The response contains the access-entry
ID, email, and level, but no Identity user ID. The creator is always the sole
Admin and cannot have an access entry.

## Nested song contract

| Method | Path | Minimum access | Success |
| --- | --- | --- | --- |
| `GET` | `/songbooks/{bookId}/songs` | Reader | `200` songs |
| `POST` | `/songbooks/{bookId}/songs` | Editor | `201` song |
| `GET` | `/songbooks/{bookId}/songs/{songId}` | Reader | `200` song |
| `PUT` | `/songbooks/{bookId}/songs/{songId}` | Editor | `204` |
| `DELETE` | `/songbooks/{bookId}/songs/{songId}` | Editor | `204` |

The former unscoped `/songs` routes do not exist. Route IDs are authoritative;
the body never accepts `songBookId` and cannot redirect an update.

Create payload:

```json
{
  "title": "Amazing Grace",
  "author": "John Newton",
  "originalTitle": null,
  "number": "1",
  "key": "G",
  "tempo": "Moderate",
  "parts": [
    { "name": "Verse 1", "text": "..." }
  ]
}
```

For updates, include each retained existing part's server-issued `id`; omit
`id` for new parts. The array order is persisted as zero-based positions.

## Authorization behavior

- Reader: view the book and songs.
- Editor: Reader permissions plus song create/update/delete.
- Admin (derived only from `OwnerId`): Editor permissions plus rename/delete
  book and collaborator management.
- Missing or inaccessible private resources return `404`.
- A Reader song mutation or collaborator admin action returns `403`.
- Permission is queried from SQLite on every request, so revocation is
  immediate.

Deleting a book cascades to its songs, parts, and access entries. Deleting a
collaborator account cascades its access rows. Owner account deletion is
restricted so it cannot silently delete owned books.

## Validation

```sh
dotnet test SongBookApi.slnx

dotnet ef migrations list \
  --project src/SongBookApi.Infrastructure/SongBookApi.Infrastructure.csproj \
  --startup-project src/SongBookApi.Service/SongBookApi.Service.csproj \
  --context SongBookDbContext
```

The 2026-08-31 validation run passed 24 tests. It also completed an external
HTTPS book/song workflow against a temporary SQLite database, restarted the
API, and retrieved the persisted session, book, song, and ordered part.

`src/SongBookApi.Service/SongBookApi.Service.http` documents executable sample
requests. `pwsh ./utils/simpleCurl.ps1` exercises the authenticated nested CRUD
contract for an already confirmed Development account.

Package restore currently reports known high-severity advisories for transitive
`Microsoft.OpenApi` 2.0.0 and `SQLitePCLRaw.lib.e_sqlite3` 2.1.11. They should
be upgraded before production use.
