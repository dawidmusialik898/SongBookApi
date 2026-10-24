# SongBook API

ASP.NET Core API for private, persistent song books. Identity users, books,
collaborator access, songs, ordered parts, and timestamps are stored together
in the SQLite database at `src/SongBookApi.Service/App_Data/songbook.db`.
Commands in this document run from the `server/` directory of the SongBook
monorepo.

## Run locally

```sh
dotnet dev-certs https --trust
dotnet run \
  --project src/SongBookApi.Service/SongBookApi.Service.csproj \
  --launch-profile https
```

The Development HTTPS origin is `https://localhost:7152`. The API also serves
the `client/` entry page and static assets from that origin.
Migrations are applied automatically at startup in Development. Production
requires a separate `--migrate` step before starting the server. Development
confirmation and password-reset links are written to the API terminal rather
than sent as email.
Open the logged confirmation link to activate a Development account; use
**Resend confirmation** to generate another link for an existing account.

## Self-hosted release

[The Ubuntu/Debian deployment guide](../deploy/README.md) covers packaging the
monorepo client with `../deploy/publish.sh`, running the API behind Caddy and
systemd, configuring Gmail SMTP and DuckDNS, and checking encrypted off-host
SQLite/key-ring backups. The published app serves only `wwwroot/index.html`,
`wwwroot/src/`, and `wwwroot/styles/`; it does not need the source checkout
on the server. Production does not migrate the database on startup.
Its public `/health` endpoint reports a failure when migrations are pending
or the last completed off-host backup is more than 24 hours old.

## Production email delivery

Outside Development, the API sends confirmation and password-reset links
through authenticated SMTP. Supply these settings via environment variables
or a secrets manager, not committed configuration:

| Setting | Value |
| --- | --- |
| `ConnectionStrings__SongBookConnection` | Production SQLite connection string |
| `AccountLinks__PublicOrigin` | Public HTTPS origin serving the client and `/auth` endpoints |
| `AllowedHosts` | Deployed host name, or semicolon-separated allowlist (no wildcard) |
| `DataProtection__KeyDirectory` | Existing protected absolute directory for persistent cookie/reset-token keys |
| `Backup__SuccessMarkerPath` | Absolute marker path updated only by a successful off-host backup |
| `Email__Smtp__Host` | SMTP server host name |
| `Email__Smtp__Port` | `587` for required STARTTLS, or `465` for implicit TLS |
| `Email__Smtp__UserName` | SMTP login |
| `Email__Smtp__Password` | SMTP password or app-specific credential; store as a secret |
| `Email__Smtp__FromAddress` | Verified sender address, e.g. `no-reply@your-domain.example` |
| `Email__Smtp__FromName` | Optional display name (defaults to `SongBook`) |
| `Moderation__BootstrapSuperUserEmail` | Email address you control for the first SuperUser; configure before confirming that account |

Set `ASPNETCORE_ENVIRONMENT=Production` and run without the Development
launch profile. Missing or invalid SMTP configuration fails startup; SMTP
delivery errors fail the request rather than falsely reporting an email sent.
For the native Linux deployment, systemd supplies the SMTP password as a
credential file; no credentials are committed to this repository.
After fixing a delivery issue, use **Resend confirmation** for an account that
was already registered. The SMTP server must support authentication over TLS;
certificate validation is never disabled by the production sender, which
does not log confirmation or reset links. Configure the sender domain with
your provider so mail is accepted and delivered, and route the public origin's
`/auth` paths to this API.

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

`GET /auth/me` returns `isAuthenticated`, `email`, and `role` (`user`,
`moderator`, or `superuser`; `null` for an anonymous session).

## User management

Configure `Moderation__BootstrapSuperUserEmail` with an email address you
control (in Development, use an environment variable). Register this account
normally, follow the emailed confirmation link, and sign in. **Only a
confirmed account whose email matches this setting becomes the first
SuperUser**. An existing confirmed account with that email is promoted at
startup; registration alone never grants privileges. No email or password is
hard-coded, and a first-registrant claim is not supported. Run the
`AddUserModeration` migration before using the feature in Production. After
the first SuperUser exists, changing the setting cannot assign a second one.
Protect and back up this account: the app has no self-service SuperUser
transfer or recovery workflow.

The **Manage users** view lists other accounts with their email, role,
confirmation, and ban status. It does not expose private song books. The
SuperUser can grant/revoke Moderator access for confirmed, active users, and
can ban, unban, or delete ordinary users and moderators. Moderators can list
users and ban, unban, or delete ordinary users only; they cannot assign roles
or manage another Moderator or the SuperUser. The SuperUser cannot ban,
demote, or delete themselves; no role can manage a SuperUser account.
Moderation roles do **not** bypass song-book ownership/access checks.

| Method | Path | Access | Request body | Success |
| --- | --- | --- | --- | --- |
| `GET` | `/admin/users?page=N` | Moderator/SuperUser | — | `200` paged user summaries (excluding caller) |
| `PUT` | `/admin/users/{userId}/role` | SuperUser | `{ "role": "moderator" }` or `{ "role": "user" }` | `204` |
| `PUT` | `/admin/users/{userId}/ban` | Moderator/SuperUser | `{ "isBanned": true }` or `false` | `204` |
| `DELETE` | `/admin/users/{userId}` | Moderator/SuperUser | — | `204` |

User IDs are GUIDs. Each summary has `id`, `email`, `role`, `isBanned`,
and `emailConfirmed`; only the superuser may change roles. Anonymous calls
return `401`, insufficient privileges return `403`, invalid input returns
`400`, and unknown accounts return `404`. All mutations need the same
antiforgery token as song-book mutations. Banning revokes existing sessions
on the next request and blocks new logins until an authorized unban. Role
changes revoke existing sessions so the user must sign in again. Deleting an
account permanently removes its owned books, songs, parts, and collaborator
access entries in one transaction; it also invalidates that account's
session. Successful moderation actions are logged with actor/target IDs and
the action, not account email addresses.

## Song-book contract

| Method | Path | Minimum access | Success |
| --- | --- | --- | --- |
| `GET` | `/songbooks?page=N` | Authenticated | `200` paged summaries |
| `POST` | `/songbooks` | Authenticated | `201` summary |
| `GET` | `/songbooks/{bookId}` | Reader | `200` summary/detail |
| `PUT` | `/songbooks/{bookId}` | Admin | `204` |
| `DELETE` | `/songbooks/{bookId}` | Admin | `204` |
| `GET` | `/songbooks/{bookId}/access?page=N` | Admin | `200` paged collaborators |
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
| `GET` | `/songbooks/{bookId}/songs?page=N` | Reader | `200` paged song summaries |
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
Each part may also have an optional `chords` array:

```json
{
  "name": "Verse 1",
  "text": "Amazing grace",
  "chords": [
    { "offset": 0, "symbol": "G" },
    { "offset": 8, "symbol": "D7" }
  ]
}
```

`offset` is a zero-based UTF-16 index into that part's exact `text` (the same
index reported by a browser text cursor). Spaces and other lyric characters
can each have a chord, including adjacent characters and characters after a
line break. Line breaks and the second half of a surrogate pair cannot be
anchors. At most one chord is allowed at each offset. `symbol` is nonblank,
trimmed on save, and at most 64 characters; any chord notation is allowed.
Invalid, duplicate, or out-of-range chords return `400` with a validation
error instead of being saved.

On `PUT`, an explicit `chords` array replaces that part's annotations;
`"chords": []` removes them. If `chords` is omitted for a retained part, its
existing annotations are preserved when its lyrics have not changed. Changing
lyrics of a chorded part without submitting `chords` returns `400` rather
than silently losing or misaligning them. Parts without chords still accept
the original payload shape and return `"chords": []` on reads. The browser
editor places chords at the lyric cursor, follows unchanged characters when
lyrics are edited, and warns when an anchored character is removed. Chorded
lyrics retain their whitespace to keep offsets stable; the song view offers
a **Show chords** toggle without altering the saved lyrics.

Apply the `AddPartChords` migration before deploying this feature; it adds
only the chord annotations table, leaving existing songs and parts intact.

## Saved PDF exports

The selected book has a **PDF exports** panel. Only its owner can generate
a PDF of all songs or select individual songs (including songs beyond the
current list page). The owner chooses lyrics-only or with-chords; both
variants, and earlier generations, remain saved and downloadable. Any
current Reader, Editor, or owner can view and download saved exports. A
removed collaborator loses access to both the list and the download route
immediately; a PDF is never exposed as a public static file.

Chorded PDFs print each lyric line in a monospace font beneath one row of
its chords. As in the song view, when chords sit closer together than their
symbols are wide, the lyric spacing widens instead of the symbols
overlapping; long lines wrap between words. A song, part, or chord row that
would straddle a page break moves to the next page when it fits there.

| Method | Path | Minimum access | Success |
| --- | --- | --- | --- |
| `GET` | `/songbooks/{bookId}/pdfs?page=N` | Reader | `200` paged export metadata |
| `POST` | `/songbooks/{bookId}/pdfs` | Owner | `201` metadata and a download `Location` |
| `GET` | `/songbooks/{bookId}/pdfs/{pdfId}/download` | Reader | `200` `application/pdf` attachment |

Generation requires the usual `X-CSRF-TOKEN`. Omit `songIds` to export the
whole book (including an empty book); otherwise supply a nonempty array of
distinct song IDs belonging to that book. Songs appear in title/ID order,
as in the paged song list:

```json
{ "includeChords": true, "songIds": ["song-guid", "another-song-guid"] }
```

`includeChords` is required. Invalid selections return `400`, an unknown or
inaccessible book/export returns `404`, and a Reader or Editor attempting
generation receives `403`. The paged list uses the same `items`, `page`,
`hasNext` shape and 50-item page size as other collections, newest first.
An export's metadata looks like:

```json
{
  "id": "pdf-guid",
  "includeChords": true,
  "isWholeBook": false,
  "songCount": 2,
  "selectedSongs": [
    { "id": "song-guid", "title": "First song" },
    { "id": "another-song-guid", "title": "Second song" }
  ],
  "generatedAtUtc": "2026-09-30T20:00:00Z",
  "isOutdated": false
}
```

For whole-book exports `selectedSongs` is empty. Book renames and song
creation, updates, or deletion increment a content revision. Older PDFs
remain unchanged and are marked `isOutdated: true` if their saved revision
differs from the current book. Changing collaborator permissions does not
change PDF content or mark it outdated. Generated PDFs are stored as SQLite
BLOBs under their book and removed when it is deleted; the existing SQLite
backup/restore includes them. Downloads are sent with `Cache-Control: no-store`
and use server-constructed attachment filenames.

Apply the `StoreSongBookPdfs` migration before using this feature in
Production. PDF rendering uses QuestPDF (Community licensing is free for
eligible open-source/individual projects; other deployments must check its
license terms). Chorded lyrics use DejaVu Sans Mono, embedded in the service
from `src/SongBookApi.Service/Resources/Fonts/` (its license is alongside and
ships with the build); other text uses QuestPDF's bundled Lato. Output
therefore does not depend on fonts installed on the host. Characters neither
font covers, such as emoji or CJK text, print as placeholder glyphs instead of
failing the export.

## Paged collections

The four list routes above default to page 1 and accept a positive integer
`page` query parameter. They return at most 50 entries per page, with this
response shape (including on an empty page):

```json
{
  "items": [],
  "page": 1,
  "hasNext": false
}
```

`hasNext` indicates whether another page exists; an invalid or overflowing
page returns `400`. Book pages are ordered by name and ID, song pages by title
and ID, collaborator pages by email and access-entry ID, and user pages by
email and ID. The client provides Previous/Next controls and returns to the
previous page if a deletion empties the current one.

Song-list items contain only `id`, `title`, `author`, and `number`. Fetch
`GET /songbooks/{bookId}/songs/{songId}` for the full song, including its
ordered parts and lyrics. The list routes still enforce their existing
authorization rules on every request. Apply the
`IndexSongsForPagedLists` migration before deploying this API; it indexes
the song-book/title/ID order used for pages.

## Authorization behavior

- Reader: view the book, songs, and saved PDFs.
- Editor: Reader permissions plus song create/update/delete.
- Admin (derived only from `OwnerId`): Editor permissions plus rename/delete
  book, collaborator management, and PDF generation.
- Missing or inaccessible private resources return `404`.
- A Reader song mutation or collaborator admin action returns `403`.
- Permission is queried from SQLite on every request, so revocation is
  immediate.

Deleting a book cascades to its songs, parts, chords, PDFs, and access entries. Deleting a
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

The 2026-09-30 Release validation passed 62 API tests and 63 client Node
tests. A packaged Production process served the client and API locally with
explicit migrations and health checks; SQLite and Data Protection key bytes
were restored with restic over a local SFTP test server. The home host, trusted
TLS, real Gmail delivery, off-host restore, monitoring, and rollback still
require operator verification before real users rely on the service.

`src/SongBookApi.Service/SongBookApi.Service.http` documents executable sample
requests. `pwsh ./utils/simpleCurl.ps1` exercises the authenticated nested CRUD
contract for an already confirmed Development account.

Run `dotnet list SongBookApi.slnx package --vulnerable --include-transitive`
to verify that the resolved dependency graph has no known vulnerable packages.
