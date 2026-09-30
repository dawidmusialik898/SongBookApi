# 12 - Song-Book Repositories and Sharing

## Goal

Let each authenticated user create private song books that act as song
repositories. A song book has a name and contains songs. Its creator is the
sole administrator and can grant registered users read-only or read/write
access.

This stage follows the mandatory
[testing and documentation policy](00-overall-plan.md#testing-and-documentation-policy).

## Selected decisions

| Decision | Selected behavior |
| --- | --- |
| Song ownership | Every song belongs to exactly one song book |
| Default visibility | Private |
| Administrator | The creator is the sole admin |
| Delegated administration | Not allowed |
| Collaborator lookup | Exact email of an already registered user |
| Reader permission | View song book and songs |
| Editor permission | Reader permission plus create/update/delete songs |
| Admin permission | Editor permission plus rename/delete book and manage access |
| Song-book names | Unique per creator, case-insensitively |
| Public songs | None after this point |

`Editor` always includes read access. The API and client must not represent
"write without read" as a separate combination.

## AI implementation specification

### Status and prerequisites

This stage is complete. The `AddSongBooks` migration follows the point-11
Identity migration, and the global in-memory repository has been replaced by
permission-scoped EF Core persistence.

Point 12 deliberately supersedes two temporary behaviors:

1. The global `/songs` collection is replaced by songs nested under a song
   book.
2. Public reads are replaced by authenticated, permission-scoped reads because
   every song book is private by default.

There is no durable song data to migrate from the existing
`InMemorySongRepository`. Starting with an empty song-book database is expected.

### Security invariants

Every implementation choice must preserve these invariants:

1. An authenticated user sees only song books they own or have an access entry
   for.
2. Knowing a GUID never grants access.
3. Every song lookup is scoped by both `songBookId` and `songId`.
4. Reader can only read.
5. Editor can read and mutate songs but cannot rename/delete the book or manage
   collaborators.
6. Only the creator can administer the book.
7. The creator cannot be removed, downgraded, or represented as a normal
   access entry.
8. Permission changes take effect on the next request.
9. All state-changing requests remain antiforgery-protected.
10. The API enforces permissions even if client controls are hidden.

This is object-level authorization. A global "authenticated user" policy alone
is insufficient.

## Target data model

Extend the point-11 `SongBookDbContext`.

### `SongBook`

```text
Id: Guid
Name: string
NormalizedName: string
OwnerId: Identity user ID
CreatedAtUtc: DateTimeOffset
UpdatedAtUtc: DateTimeOffset
Songs: collection
AccessEntries: collection
```

Rules:

- Trim `Name`.
- Length is 1-100 characters.
- Compute `NormalizedName` with invariant case normalization.
- Add a unique database index on `(OwnerId, NormalizedName)`.
- Different owners may use the same name.
- The owner relationship is required and delete-restricted until account
  deletion behavior is explicitly designed.

### `SongBookAccess`

```text
Id: Guid
SongBookId: Guid
UserId: Identity user ID
AccessLevel: Reader or Editor
CreatedAtUtc: DateTimeOffset
UpdatedAtUtc: DateTimeOffset
```

Rules:

- Add a unique index on `(SongBookId, UserId)`.
- Store no Admin value; administration is derived from `SongBook.OwnerId`.
- Reject an access row for the owner.
- Deleting a song book cascades to access entries.
- Return the access-entry ID to the admin UI; do not expose Identity user IDs
  unnecessarily.

### `Song`

Persist the existing fields plus:

```text
SongBookId: Guid
CreatedAtUtc: DateTimeOffset
UpdatedAtUtc: DateTimeOffset
```

Every query/update/delete must include `SongBookId`.

### `Part`

Persist:

```text
Id: Guid
SongId: Guid
Position: int
Name: string or null
Text: string or null
```

`Position` persists the existing parts-array order. Add a unique index on
`(SongId, Position)`. Replacing a song's parts in one transaction is acceptable
for this version as long as existing submitted part IDs remain stable.

Add a database check constraint requiring persisted final positions to be
non-negative.

### Cascades

```text
delete SongBook -> delete Songs, Parts, AccessEntries
delete Song -> delete Parts
delete collaborator account -> delete its AccessEntries
delete owner account -> restricted until account-deletion behavior is designed
```

Do not enable a cascade that can silently delete an owner's song books when an
Identity user is removed.

## Files in scope

### Domain files to add or modify

```text
SongBookApi/src/SongBookApi.Domain/Dto/Song.cs
SongBookApi/src/SongBookApi.Domain/Dto/Part.cs
SongBookApi/src/SongBookApi.Domain/Entities/SongBook.cs
SongBookApi/src/SongBookApi.Domain/Entities/SongBookAccess.cs
SongBookApi/src/SongBookApi.Domain/Entities/SongBookAccessLevel.cs
SongBookApi/src/SongBookApi.Domain/Repositories/ISongRepository.cs
SongBookApi/src/SongBookApi.Domain/Repositories/ISongBookRepository.cs
SongBookApi/src/SongBookApi.Domain/Services/ISongService.cs
SongBookApi/src/SongBookApi.Domain/Services/ISongBookService.cs
```

### Infrastructure files to add or modify

```text
SongBookApi/src/SongBookApi.Infrastructure/Identity/SongBookDbContext.cs
SongBookApi/src/SongBookApi.Infrastructure/Identity/Migrations/*
SongBookApi/src/SongBookApi.Infrastructure/Repositories/EfSongRepository.cs
SongBookApi/src/SongBookApi.Infrastructure/Repositories/EfSongBookRepository.cs
SongBookApi/src/SongBookApi.Infrastructure/Repositories/InMemorySongRepository.cs
```

Delete `InMemorySongRepository.cs` after registration and tests use the EF
repository.

### Service files to add or modify

```text
SongBookApi/src/SongBookApi.Service/Contracts/Song.cs
SongBookApi/src/SongBookApi.Service/Contracts/SongBookContracts.cs
SongBookApi/src/SongBookApi.Service/Contracts/SongBookAccessContracts.cs
SongBookApi/src/SongBookApi.Service/Endpoints/SongEndpoints.cs
SongBookApi/src/SongBookApi.Service/Endpoints/SongBookEndpoints.cs
SongBookApi/src/SongBookApi.Service/Extensions/ServicesExtensions.cs
SongBookApi/src/SongBookApi.Service/Authentication/SongBookAccessService.cs
SongBookApi/src/SongBookApi.Service/Authentication/ISongBookAccessService.cs
SongBookApi/src/SongBookApi.Service/SongBookApi.Service.http
SongBookApi/utils/simpleCurl.ps1
```

The currently empty `Service/Contracts/Song.cs` should become real request and
response contracts rather than remain dead code.

### Test files to add or modify

```text
SongBookApi/tests/SongBookApi.Service.Tests/SongBookTests.cs
SongBookApi/tests/SongBookApi.Service.Tests/SongBookAccessTests.cs
SongBookApi/tests/SongBookApi.Service.Tests/SongBookAuthorizationTests.cs
SongBookApi/tests/SongBookApi.Service.Tests/TestApplicationFactory.cs
```

### Client files to add or modify

```text
SongBookClient/index.html
SongBookClient/src/main.js
SongBookClient/src/songsApi.js
SongBookClient/src/songBooksApi.js
SongBookClient/styles/app.css
SongBookClient/styles/buttons.css
```

`httpClient.js`, `authApi.js`, and `songForm.js` retain their point-11/07
responsibilities.

## Phase 1 - Add persistent entities and migration

1. Add the song-book/access entities and access enum.
2. Add `SongBookId` and persistence timestamps to `Song`.
3. Add `SongId` and `Position` to `Part`.
4. Extend `SongBookDbContext` with the required `DbSet` properties.
5. Configure keys, required relationships, indexes, lengths, normalized name,
   and delete behaviors with Fluent API.
6. Add the `AddSongBooks` migration after the point-11 Identity migration.
7. Apply it to the local SQLite database.

Migration commands:

```sh
dotnet ef migrations add AddSongBooks \
  --project src/SongBookApi.Infrastructure/SongBookApi.Infrastructure.csproj \
  --startup-project src/SongBookApi.Service/SongBookApi.Service.csproj \
  --context SongBookDbContext \
  --output-dir Identity/Migrations

dotnet ef database update \
  --project src/SongBookApi.Infrastructure/SongBookApi.Infrastructure.csproj \
  --startup-project src/SongBookApi.Service/SongBookApi.Service.csproj \
  --context SongBookDbContext
```

Do not create a second application database context or a separate song SQLite
file.

## Phase 2 - Replace repository contracts

### `ISongRepository`

Replace the global methods with song-book-scoped operations:

```text
GetAllAsync(songBookId)
GetByIdAsync(songBookId, songId)
AddAsync(songBookId, song)
UpdateAsync(songBookId, songId, song)
DeleteAsync(songBookId, songId)
```

Remove the misspelled `GetllSongsAsync`.

Requirements:

- Reads use no-tracking queries where entities will not be edited.
- Include parts ordered by `Position`.
- Create/update parts and order inside one database transaction.
- Reordering must not update final positions directly under the unique
  `(SongId, Position)` index. First move retained parts to a non-colliding
  temporary positive range above both the current and final ranges and save,
  then apply removals/additions/final zero-based positions and save within the
  same transaction.
- Route IDs remain authoritative.
- A song ID from another book behaves as not found.

### `ISongBookRepository`

Provide operations for:

```text
list books accessible to a user
get one book by ID
create book
rename book
delete book
check owner-name uniqueness
list access entries with collaborator email
find access entry by book and user
upsert Reader/Editor access
remove access by access-entry ID
```

Do not expose a method that lists every Identity user.

### Service layer

Update `ISongService` so every method accepts `songBookId`.

Add `ISongBookService` to:

- Validate/normalize names.
- Create the book with `OwnerId` from the authenticated principal.
- Enforce owner-only rename/delete/access management.
- Resolve exact collaborator email through `UserManager<ApplicationUser>`.
- Reject unknown users, the owner, and invalid access levels.
- Translate unique-index races into `409 Conflict`.

## Phase 3 - Implement effective access checks

Create one `ISongBookAccessService` that returns:

```text
None
Reader
Editor
Admin
```

For `(songBookId, userId)`:

1. Return `Admin` when `OwnerId == userId`.
2. Otherwise return the stored Reader/Editor access.
3. Otherwise return `None`.

Use this service at every song-book and nested-song endpoint.

Response rules:

| Situation | Result |
| --- | --- |
| Not authenticated | `401` |
| Book does not exist | `404` |
| Book exists but user has no access | `404` to avoid leaking existence |
| Reader attempts a song mutation | `403` |
| Reader/Editor attempts admin action | `403` |
| Admin performs allowed action | Normal endpoint result |

Do not trust an access level supplied by the client or cached in client state.

## Phase 4 - Add song-book API contracts

Use service request/response DTOs so EF/Identity entities are never returned
directly.

### Song-book summary

```json
{
  "id": "guid",
  "name": "Sunday Service",
  "accessLevel": "admin",
  "songCount": 12
}
```

Allowed `accessLevel` response values:

```text
admin
editor
reader
```

### Create/rename request

```json
{
  "name": "Sunday Service"
}
```

### Collaborator response

Only an admin may receive:

```json
{
  "id": "access-entry-guid",
  "email": "reader@example.com",
  "accessLevel": "reader"
}
```

### Set-access request

```json
{
  "email": "editor@example.com",
  "accessLevel": "editor"
}
```

Only `reader` and `editor` are accepted. Sending `admin` returns validation
failure.

### Song contracts

Keep the existing scalar and parts shape, with IDs only in responses and
existing-part updates. Do not accept `songBookId` from a song body; it comes
from the route.

## Phase 5 - Replace endpoint routes

All routes require the point-11 authenticated-user policy. GET requests do not
require antiforgery; every POST/PUT/DELETE does.

### Song-book routes

| Method | Path | Minimum access | Success |
| --- | --- | --- | --- |
| `GET` | `/songbooks` | Authenticated | `200` accessible summaries |
| `POST` | `/songbooks` | Authenticated | `201` created summary |
| `GET` | `/songbooks/{bookId}` | Reader | `200` detail |
| `PUT` | `/songbooks/{bookId}` | Admin | `204` |
| `DELETE` | `/songbooks/{bookId}` | Admin | `204` |
| `GET` | `/songbooks/{bookId}/access` | Admin | `200` collaborators |
| `PUT` | `/songbooks/{bookId}/access` | Admin | `200` created/updated collaborator |
| `DELETE` | `/songbooks/{bookId}/access/{accessId}` | Admin | `204` |

### Nested song routes

| Method | Path | Minimum access | Success |
| --- | --- | --- | --- |
| `GET` | `/songbooks/{bookId}/songs` | Reader | `200` |
| `POST` | `/songbooks/{bookId}/songs` | Editor | `201` |
| `GET` | `/songbooks/{bookId}/songs/{songId}` | Reader | `200` |
| `PUT` | `/songbooks/{bookId}/songs/{songId}` | Editor | `204` |
| `DELETE` | `/songbooks/{bookId}/songs/{songId}` | Editor | `204` |

Remove the old unscoped routes:

```text
/songs
/songs/{id}
```

Do not keep compatibility aliases; they would create an authorization-bypass
risk and there is no durable legacy song data to preserve.

### Additional response rules

- Invalid/blank/overlong book name: `400 ValidationProblem`.
- Duplicate normalized name for the same owner: `409`.
- Registered collaborator email not found: `404`.
- Owner email submitted as collaborator: `400`.
- Access entry not in the specified book: `404`.
- Reapplying the same access level is idempotent and returns the current member.

## Phase 6 - Update client API modules

### Add `songBooksApi.js`

Export:

```text
getSongBooks()
createSongBook(payload)
getSongBook(bookId)
renameSongBook(bookId, payload)
deleteSongBook(bookId)
getSongBookAccess(bookId)
setSongBookAccess(bookId, payload)
removeSongBookAccess(bookId, accessId)
```

Use `httpClient.js`; no raw `fetch`.

### Change `songsApi.js`

Every function takes `bookId`:

```text
getSongs(bookId)
getSong(bookId, songId)
createSong(bookId, payload)
updateSong(bookId, songId, payload)
deleteSong(bookId, songId)
```

Build only nested relative URLs and URL-encode both IDs.

### Error handling

Keep `ApiError` behavior:

- `401`: refresh session and open login.
- `403`: preserve state and explain insufficient permission.
- `404` for the selected book: clear it and reload accessible books.
- `409` during create/rename: retain form and show duplicate-name feedback.

## Phase 7 - Add client state and navigation

Extend application state:

```js
songBooks: [],
selectedSongBookId: null,
selectedSongBook: null,
selectedSongBookAccessLevel: null,
songBookMembers: [],
isLoadingSongBooks: false,
isSavingSongBook: false,
isLoadingSongBookMembers: false,
isSavingSongBookAccess: false
```

When auth becomes anonymous, clear all private book/song/member state.

After authenticated startup:

1. Load accessible song books.
2. Show an empty state when none exist.
3. Select no book automatically unless there is exactly one; if exactly one,
   select it for convenience.
4. Load songs only after a book is selected.

Changing books must clear selected song/detail/editor state before loading the
next book.

## Phase 8 - Add song-book UI

At wider widths, accessible song books and the create/rename form occupy a
left sidebar. The selected book's details, its songs, and the song workspace
share the main column. On narrow screens, the sidebar stacks above the
content; choosing a book keeps the existing selection and focus behavior.

The later user-management addition gives SuperUsers and Moderators a separate
**Manage users** view. It does not grant access to private song books: the
server enforces account roles separately from song-book permissions. The
SuperUser can assign/revoke Moderator access and ban/unban/delete users;
Moderators can ban/unban/delete ordinary users only. Register and confirm the
operator-configured bootstrap email before that account becomes the first
SuperUser. See the API README for provisioning and endpoint details.

### Required HTML IDs

| ID | Purpose |
| --- | --- |
| `song-book-list` | Accessible books |
| `song-book-list-state` | Loading/empty/error text |
| `new-song-book-button` | Open create form |
| `song-book-form` | Create/rename form |
| `song-book-form-heading` | Current form mode |
| `song-book-name` | Book name input |
| `cancel-song-book-button` | Cancel create/rename |
| `save-song-book-button` | Submit create/rename |
| `selected-song-book-heading` | Current book name/access |
| `rename-song-book-button` | Admin-only rename |
| `delete-song-book-button` | Admin-only delete |
| `song-book-access-panel` | Admin-only collaborator management |
| `song-book-access-list` | Existing collaborators |
| `song-book-access-form` | Add/update access |
| `song-book-access-email` | Exact registered email |
| `song-book-access-level` | Reader/Editor select |
| `save-song-book-access-button` | Submit access |

Use a normal labelled `<select>` with `reader` and `editor`; do not implement
independent read/write checkboxes because Editor already includes Reader.

### Permission-aware controls

| Effective access | Visible capabilities |
| --- | --- |
| Admin | View, song CRUD, rename/delete book, manage access |
| Editor | View and song CRUD |
| Reader | View only |
| None/anonymous | No book content |

Client gating improves usability but never replaces server checks.

### Book flows

- Create: submit name, receive `201`, reload list, select created book.
- Rename: admin only, preserve input after 400/409, refresh selected summary.
- Delete: admin confirmation includes book name and warns that all songs and
  access entries are deleted; refresh list afterward.
- Selection: load book detail and nested songs.

Use `window.confirm()` for first-version book deletion. No Undo is possible.

### Access-management flows

- Admin enters an exact registered email and selects Reader or Editor.
- `PUT` creates a new entry or updates an existing user's access.
- Render collaborator email, level, Change action, and Remove action.
- Remove requires confirmation and refreshes the access list.
- Do not show the owner's email as a removable collaborator.
- Collaborators do not see the access list or collaborator email addresses.

### Revocation and stale access

If a collaborator loses access while viewing a book:

1. The next request returns `404` or `403`.
2. Clear selected book/song/editor/member state.
3. Reload `/songbooks`.
4. Explain that access is no longer available.

Do not continue displaying cached private song data after access loss.

## Phase 9 - Update existing song UI

1. Replace global song loading with loading for `selectedSongBookId`.
2. Hide New/Edit/Delete song controls for Reader.
3. Keep those controls for Editor and Admin.
4. Include the selected book ID in every song API call.
5. Preserve all existing loading, 204, race, form, part-order, and delete
   behavior within the selected book.
6. On book change, cancel any open song draft rather than saving it into the
   wrong repository.
7. Never infer permissions from whether a button is present; use the access
   level returned by the API for display only and handle server denial.

## Phase 10 - Automated authorization tests

Use at least three confirmed users:

```text
owner@example.com
reader@example.com
editor@example.com
```

Required tests:

1. An authenticated user can create a song book and becomes its Admin.
2. New books are visible only to their owner.
3. Name is required, limited to 100 characters, and unique per owner
   case-insensitively.
4. Two different owners may use the same normalized name.
5. Anonymous access to `/songbooks` returns `401`.
6. A user with no access receives `404` for another user's book and songs.
7. Admin can grant Reader by exact registered email.
8. Reader can list/view songs but receives `403` for song writes.
9. Admin can upgrade Reader to Editor idempotently.
10. Editor can create/update/delete songs but receives `403` for rename,
    delete-book, and access management.
11. Admin can revoke access; the user immediately loses the book from their
    list and receives `404` for direct routes.
12. Unknown email cannot receive access.
13. Owner cannot add/downgrade/remove themselves through access endpoints.
14. One song cannot be read or mutated through another book's route.
15. Deleting a book cascades songs, parts, and access entries.
16. Part positions survive database reload.
17. Old `/songs` routes return `404`.
18. Every mutation rejects a missing/invalid antiforgery token.
19. Collaborators cannot retrieve the admin-only access list.
20. Database unique constraints protect name/access races.

Tests must assert persisted database state, not only HTTP response codes.

## Acceptance criteria

- [x] A confirmed user can create a private named song book.
- [x] The creator is always the sole Admin.
- [x] Names are unique per creator without case sensitivity.
- [x] Every song belongs to one and only one song book.
- [x] Unshared books and songs are invisible to other users.
- [x] Admin can grant/update/remove Reader and Editor access by registered
      email.
- [x] Reader can view but cannot mutate.
- [x] Editor can manage songs but cannot administer the book.
- [x] Admin can rename/delete the book and manage collaborators.
- [x] Revocation takes effect on the next request and clears stale client data.
- [x] All data persists across API restarts.
- [x] Old unscoped song endpoints are removed.
- [x] Automated tests prove tenant isolation and the complete permission matrix.

### Validation record - 2026-08-31

- `dotnet test SongBookApi.slnx`: 24 passed, 0 failed.
- The client Node suites: 54 passed, 0 failed.
- EF tooling lists `20260727222024_AddIdentity` followed by
  `20260831193025_AddSongBooks`.
- Hosted tests cover private visibility, owner-only administration,
  Reader/Editor permissions, collaborator changes, immediate revocation,
  cross-book song isolation, database uniqueness, cascades, part order,
  antiforgery, old-route removal, and file-backed restart persistence.
- Client tests cover nested adapters, book CRUD, permission-aware controls,
  collaborator management, stale-access cleanup, cross-account draft
  isolation, and late-response protection.
- A real HTTPS run against a temporary SQLite database completed login, book
  creation, nested song creation/listing, API restart, session restoration,
  and persisted book/song/part retrieval.
- The three-profile visual browser script remains available below for manual
  UI and accessibility inspection.

## Validation commands

From the API repository:

```sh
dotnet build SongBookApi.slnx
dotnet test SongBookApi.slnx
dotnet ef migrations list \
  --project src/SongBookApi.Infrastructure/SongBookApi.Infrastructure.csproj \
  --startup-project src/SongBookApi.Service/SongBookApi.Service.csproj \
  --context SongBookDbContext
```

From the client repository:

```sh
node --check src/httpClient.js
node --check src/authApi.js
node --check src/songBooksApi.js
node --check src/songsApi.js
node --check src/songForm.js
node --check src/main.js
rg "fetch\\(" src --glob "*.js"
rg "https://localhost|http://localhost|/songs" src --glob "*.js"
```

Expected results:

- Raw fetch remains only in `httpClient.js`.
- No hard-coded origin remains.
- Any `/songs` occurrence is part of a nested
  `/songbooks/{bookId}/songs` URL, not an unscoped endpoint.

## Browser acceptance script

Use separate browser profiles/private windows for three confirmed accounts.

1. Owner creates `"Sunday Service"` and adds two songs.
2. Reader and Editor cannot see it before sharing.
3. Owner grants Reader access by exact email.
4. Reader sees the book and songs but has no mutation/admin controls.
5. A manual Reader write request receives `403`.
6. Owner grants Editor access.
7. Editor creates, edits, and deletes a song.
8. Editor cannot rename/delete the book or view/manage collaborators.
9. Owner changes Reader to Editor, then removes that access.
10. Removed user loses the selected book on the next request.
11. Owner tries to create `"sunday service"` and receives duplicate-name
    feedback.
12. Another user creates `"Sunday Service"` successfully.
13. Owner deletes the original book and confirms its songs/access disappear.
14. Restart the API and confirm remaining books, permissions, songs, parts,
    and part order persist.

## Non-goals

- Do not allow public song books, anonymous reads, multi-owner books, admin
  delegation, ownership transfer, pending invitations, user search, groups,
  teams, or organization-wide permissions.
- Do not allow one song to belong to multiple books.
- Do not add per-song permissions; access applies to the whole book.
- Do not implement real-time collaboration, edit locking, conflict merging,
  version history, trash/restore, cloning, importing, or exporting.
- Do not implement account deletion while owner behavior is unresolved.
- Do not trust client permission state as authorization.
- Do not retain old unscoped song endpoints.

## Learning notes

- Authentication identifies the caller; resource authorization determines
  whether that caller may access one specific song book.
- Nested routes make ownership context explicit but still require database
  scoping and permission checks.
- Returning `404` for inaccessible private resources avoids confirming that a
  guessed ID exists.
- A unique database index is still necessary after an application-level
  duplicate-name check because two requests can race.
- Hiding collaborator email addresses from non-admin users reduces unnecessary
  personal-data exposure.

## Resources

- [Microsoft: Resource-based authorization](https://learn.microsoft.com/aspnet/core/security/authorization/resourcebased)
- [Microsoft: EF Core relationships](https://learn.microsoft.com/ef/core/modeling/relationships)
- [Microsoft: EF Core indexes](https://learn.microsoft.com/ef/core/modeling/indexes)
- [Microsoft: EF Core transactions](https://learn.microsoft.com/ef/core/saving/transactions)
- [OWASP: Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)
- [OWASP: Insecure Direct Object Reference Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Insecure_Direct_Object_Reference_Prevention_Cheat_Sheet.html)

## Checkpoint

This point is complete when private song books persist, the creator retains
sole administration, registered collaborators receive only their granted
Reader/Editor capabilities, every song is securely scoped to one book, and the
authorization test matrix passes.
