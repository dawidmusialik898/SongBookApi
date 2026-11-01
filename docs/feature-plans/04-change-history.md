# Change history and linear song versioning

## Goal and defaults

Add private book activity and immutable song revisions: who changed what/when,
comparison, prior-version restore and deleted-song recovery. No Git dependency,
branches, merges, bulk/full-book rollback, access rollback or cryptographic audit.

Readers/editors/owners may inspect song-content history. Only owners see
collaborator/link-management events; public link readers see no history/actors.
Editors/owners can restore. Retain revisions until book deletion, with paginated
summaries and on-demand snapshots. Book deletion cascades history and remains
irreversible.

Derive actor/time on the server; resolve actor from user records, with nullable
references and "Deleted user" fallback. Do not permanently snapshot emails.
Existing data has unknown prior history: lazily record an unattributed baseline
before its first mutation rather than inventing earlier changes.

## Implementation

1. Add activity and versioned JSON song-snapshot entities/contracts/helpers.
   Snapshots contain metadata, exact lyrics, ordered parts/IDs/chords, operation,
   UTC time, actor and optional restored-from version.
   Keep logical song IDs after deletion; do not cascade revisions from Song.
   Add unique `(SongBookId, SongId, Revision)` and paging indexes, book cascade,
   nullable actor FK and current song revision counter distinct from PDF revision.
   Include migration/designer/snapshot and safe existing-data defaults.
2. Thread server mutation context through service/repository paths compatibly.
   Write activity/revision in the same transaction as successful data changes
   and existing PDF-revision updates. Failed validation/rollback leaves no audit.
   Cover book create/rename, song create/update/delete/restore, collaborator
   changes; provide writer interfaces for later copy/PDF/link operations.
3. Return song revision; accept optional expectedRevision on edits/deletes.
   New client always sends it, transaction checks return 409 if stale.
   Omitted values preserve existing last-write semantics for old callers.
   Revision allocation still needs transactional concurrency safety.
4. Add authenticated paged `/songbooks/{bookId}/history`,
   `/songs/{songId}/history`, and `/songs/{songId}/history/{revision}` reads.
   Return summaries without loading all snapshots; retain deleted-song lookup.
   Filter sensitive events by permission and use stable newest-first ordering.
5. Add antiforgery-protected editor/owner
   `POST /songbooks/{bookId}/songs/{songId}/history/{revision}/restore` with
   expected latest revision. Restore appends new history, current actor/time and
   one PDF-staleness increment; never rewrites old snapshots.
6. Reconcile live parts safely, recreating removed historical IDs only if no
   unrelated collision exists. Recover a deleted song under its logical ID after
   availability checks. Validate stored schema/chords and return controlled
   conflicts for stale restore/collisions; never resurrect a deleted book.
7. Add book/song history screens, revision preview, deterministic metadata/
   part/chord/lyric-line comparison, confirm/cancel restore and discoverable
   deleted-song recovery. Use literal text and add/remove stylesheet classes.
8. Preserve editor values/drafts on 409 with reload/compare guidance, no automatic
   overwrite. Update deletion copy to explain history recovery.
9. Extend fake API snapshots/concurrency/restore, tests and documentation.

## Files and integration

Primary files: song domain/contracts/service/repository, EF song/book
repositories/context, migrations/snapshot, song/book endpoints and service,
registration, client book/song/editor controllers, songs API/routes/error helpers
and fake API. Add narrowly scoped history entities/API/screens as needed.
Inspect moderation deletion paths for actor FK compatibility.

Implement first. Later agents reuse mutation context/activity writer instead of
adding competing mechanisms. Preserve existing part/chord semantics, search,
SQL ordering, PDF staleness, CSP and session/navigation safeguards.

## Acceptance and validation

Real tests cover correct actor/action/time, immutable complete snapshots,
baseline/migration, ordered pagination, deleted-song history/book cascade,
authorization/sensitive filtering, antiforgery and actor spoofing.
Verify failed validation atomicity, concurrent unique revisions and stale 409s.
Restore tests cover metadata/text/chords/order/removed parts/deleted songs, fresh
appended revision and exactly one PDF-staleness increment.

Client tests cover feeds/comparison/recovery/permissions, confirmation/cancel,
busy/failure/session races, literal rendering and 409 draft preservation.
Run focused history tests plus existing CRUD/chord/authorization/persistence/PDF
and client editor/song/book/session tests. An editor must recover prior/deleted
content without erasing history or silently overwriting a newer revision.
