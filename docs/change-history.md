# Private activity and song history

Book and song screens have a **History** action. Book activity also links deleted
songs to their retained history. Readers can inspect content events and pick a
revision from the song history's **Revision** dropdown to preview it in full. A
separate **Compare revisions** screen shows song-detail changes as old → new
values and one card per added, removed, renamed, moved or edited part. Edited
parts show changed lines as Before/After chord sheets, highlighting the changed
letters and chords; part IDs and character offsets are never shown. Only book
owners see collaborator or link-management activity. Editors and owners can
restore the selected revision after confirmation, including deleted songs.
Public capability access must never expose these private endpoints or actors.

History is linear and retained until the book is deleted. Restore appends a new
revision; it does not alter earlier snapshots or restore permissions. Book
deletion cascades history and is irreversible. This is not a cryptographic audit,
Git integration, branching, full-book rollback or an automatic retention policy.

## API

All routes require the existing cookie policy and book membership. Missing or
inaccessible books return `404`; readers attempting restoration receive `403`.
Restore and existing mutations require `X-CSRF-TOKEN`.

| Method | Route | Result |
| --- | --- | --- |
| GET | `/songbooks/{bookId}/history?page=1` | `{ items, page, hasNext }` activity summaries |
| GET | `/songbooks/{bookId}/songs/{songId}/history?page=1` | `{ revisions: { items, page, hasNext }, latestRevision, deleted }` |
| GET | `/songbooks/{bookId}/songs/{songId}/history/{revision}` | `{ summary, snapshot: { schemaVersion: 1, song } }` |
| POST | `/songbooks/{bookId}/songs/{songId}/history/{revision}/restore` | Body `{ expectedRevision }`; result `{ id, revision }` |

Pages contain at most 50 entries with one-row lookahead. Activity is ordered by
UTC time/ID descending; song summaries by monotonic revision descending. Feeds
do not load snapshot JSON. Actor and collaborator names resolve from current
user records; deletion nulls references and displays **Deleted user**. Identity
emails are never copied into snapshots or activity descriptions.

Song detail/create responses include `revision`, separate from the book's PDF
`ContentRevision`. New songs start at 1. Existing songs default to 0 after
migration; reads do not invent history. Their first edit/delete transaction
captures revision 1 as an explicitly unattributed **baseline**, at the time
tracking begins, and appends the mutation as revision 2. Earlier actors and
history remain unknown. The full snapshots include all song fields, original
timestamps, ordered part IDs/text and ordered chords with UTF-16 offsets.
A deletion revision contains the last content, not an empty snapshot.
Copies start independent revision-1 lineages labeled `song.copied`, without
source provenance or history. See [copying songs](copy-songs.md).

Updates accept optional `expectedRevision` in their JSON body; deletes accept it
as a query parameter. A stale value returns `409` without modifying content,
history or PDF staleness. Omission preserves legacy last-write behavior. The
client always submits its loaded revision, retains form/draft data on conflict,
and offers comparison or confirmation-based reload rather than overwriting.
Kept drafts retain their original expected revision across navigation.

Restore requires the latest lineage revision (including deletion). It validates
stored schema/chords/IDs, preserves available historical part IDs, recreates
removed parts, and recovers deleted songs under their original logical ID.
ID collisions, invalid snapshots and stale restore requests return controlled
`409` responses. Every successful song mutation increments PDF staleness exactly
once. SQLite transactions serialize revision allocation, including legacy writes.
Apply `AddChangeHistory` and `AddActivitySubjects`, including their designer/model
snapshot, before deployment. Tests cover fresh migration and pre-feature data
upgrade, actor deletion, transaction rollback and concurrent writes.

## Reusable integration contract

`server\src\SongBookApi.Domain\Services\HistoryContracts.cs` defines scoped
`IMutationContext` and `IActivityWriter`. EF implementations use the same scoped
`SongBookDbContext` as the mutation repositories.

- Authenticated boundaries use `MutationAttributionFilter`, or set
  `mutation.Current = new MutationContext(serverDerivedUserId)` themselves.
  Never bind this context from client JSON. The writer generates UTC time.
- For copying, set `mutation.Current = mutation.Current with
  { Operation = "song.copied", ExpectedRevision = null }`, then call the existing
  `ISongService.CreateSongAsync(destinationBookId, deepCopy)` with fresh song/part
  IDs. Song creation already stages its full revision/activity and increments
  PDF staleness. Do **not** call the writer again for the same song mutation.
- For PDF/link actions, begin the repository transaction, mutate data, call
  `writer.StageActivity(bookId, "pdf.generated")` or
  `writer.StageActivity(bookId, "link.created", ownerOnly: true)`, then
  `SaveChangesAsync` and commit. Link operations use `link.created`,
  `link.replaced`, `link.revoked`; collaborator/link prefixes are always treated
  as owner-only by the writer. Do not include tokens, permanent emails or other
  secrets in `description`.
- Signature: `StageActivity(Guid bookId, string operation, Guid? songId = null,
  long? revision = null, bool ownerOnly = false, string? description = null,
  string? subjectUserId = null)`. Subject IDs are nullable current-user references,
  not email snapshots.
- `StageRevision(Song song, string operation, long? restoredFromRevision = null,
  bool unattributed = false)` is available to history-aware repository code.
  Ordinary song operations should reuse the existing repository rather than
  allocate revisions or reconcile graphs independently.
- Staging never saves/commits. Entries and mutation must share one transaction.
  Song repositories join an existing transaction without committing it. If an
  operation fails, roll back and discard its scoped context/tracked state. Restore
  the previous mutation context in `finally` when temporarily overriding it.
  `RestoredFromRevision` is reserved for the trusted restore implementation.

PDF generation now uses this contract: its authenticated endpoint sets the
mutation context, and the EF PDF repository stages `pdf.generated` and saves
the file in one transaction. Failed saves leave neither a PDF nor an activity.
Generation does not advance book content or song revisions. See
[PDF customization](pdf-customization.md).
