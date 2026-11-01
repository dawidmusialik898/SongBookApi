# Copy songs between books

Implemented behavior and API usage: [copying songs](../copy-songs.md).

## Goal and defaults

Allow an authenticated source reader/editor/owner to deep-copy one song into a
different book where they are editor/owner. Public link access alone is excluded.
Copy all metadata, exact lyrics, ordered parts and chords with fresh song/part
identities, timestamps and revision lineage. No synchronization, source history,
membership copying, bulk copy, move or deduplication. Duplicate titles/numbers
remain allowed; reject same-book copying.

## Implementation

1. Add antiforgery-protected authenticated
   `POST /songbooks/{destinationBookId}/songs/copy` with
   `{ sourceBookId, sourceSongId }`; return 201, ordinary song response and Location.
2. Check source read and destination write permissions on every request.
   Inaccessible/missing resources return 404; a destination reader gets 403.
   Validate IDs and same-book requests before writing.
3. Load the complete source graph and construct an independent graph. Generate
   new IDs, preserve position and UTF-16 anchors, and explicitly populate chord
   arrays/PartId values. Never reuse tracked entities.
4. Use history-aware song creation so song, initial revision, copy activity and
   destination PDF-revision increment commit atomically. Source state stays
   unchanged. Do not expose private source details through destination activity.
5. Add reader-visible "Copy to song book" on source song screens and a paged
   writable-destination picker. Exclude source, continue through pages with no
   writable results, and show clear no-destination guidance.
6. Preserve picker values on failure; handle cancel, revoked permissions,
   duplicate submission, account-switch and navigation races. Navigate to the
   created destination song after success.
7. Extend API adapter, fake API, messages and documentation.

## Files and integration

Primary files: `SongEndpoints.cs`, song contracts/services/repository,
`client/src/songsApi.js`, song screen, route registration, small copy screen,
existing paged-list/dialog helpers, error messages and fake API.

Depend on history mutation attribution/revision interfaces; avoid a second
creation/audit implementation. No migration is required solely for copying.
Preserve literal rendering, CSP, SQL ordering and chord omission semantics.

## Acceptance and validation

API tests cover source reader/editor/owner, destination editor/owner/reader,
outsider/anonymous/banned, antiforgery, wrong-book IDs, missing source, same-book
rejection and revocation. Verify complete metadata/parts/chords/Unicode, new IDs,
independent subsequent edits/deletions, destination-only PDF staleness and copy
revision/activity without private provenance leakage.

Client tests cover paginated destinations/empty filtered pages, no targets,
reader action visibility, cancel, duplicate submit, failure and session races.
Run focused copy tests plus existing CRUD/chord/authorization and client
songs-api/song-screen/session tests.
