# Copy songs between song books

From an authenticated song view, **Copy to song book** is available to readers,
editors and owners. Choose a different book where you are editor/owner, then
**Copy song**. The picker loads accessible books in pages, skips pages containing
only read-only/source books, and offers **Show more** for additional destinations.
If there are no targets, create another book or ask its owner for editor access.
Cancel returns to the source; errors keep the selection. Busy submissions cannot
start a second copy, and late responses cannot change a navigated/account-switched
screen. Success opens the new destination song.

## API

`POST /songbooks/{destinationBookId}/songs/copy` accepts:

```json
{ "sourceBookId": "source-book-guid", "sourceSongId": "source-song-guid" }
```

The route requires a confirmed cookie session and `X-CSRF-TOKEN`. The server
checks source membership (reader/editor/owner) and destination write membership
(editor/owner) on every request. Public-link access is not permission to copy.
Missing or inaccessible books/songs, including a song ID belonging to a different
source book, return `404`; a destination reader receives `403`; anonymous/banned
sessions receive `401`. Empty IDs and same-book copying return `400`.
Invalid GUID route values do not match a route; invalid GUID JSON returns `400`.

Success returns `201`, the ordinary song response (including revision `1`), and
`Location: /songbooks/{destinationBookId}/songs/{newSongId}`.
The copy retains all metadata, ordered parts, exact lyric strings and chords,
including UTF-16 offsets and explicitly empty chord arrays. Song/part identities,
timestamps and revision lineage are new. Chord PartIds point to the new parts.

The existing history-aware creation transaction commits the song graph, initial
`song.copied` revision/activity and one destination PDF content-revision increment.
The actor is server-derived; destination history contains no source book/song
IDs, private source names, source history or memberships. Source content, history
and saved-PDF freshness do not change. Later edits/deletions are independent.
No additional migration is needed beyond the [history migrations](change-history.md).

Duplicate titles and numbers are allowed, including repeated intentional copies.
This is one-song reuse, not bulk copy, move, deduplication, live synchronization,
edit-before-copy or a public-link import.
