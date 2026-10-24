# 08 - Delete Flow

## Goal

Implement `DELETE /songs/{id}` in a way that makes the destructive action
clear, avoids duplicate requests, and restores a truthful UI after success or
failure.

This stage follows the mandatory
[testing and documentation policy](00-overall-plan.md#testing-and-documentation-policy).

## AI implementation specification

### Status and prerequisites

This stage is complete. Points 04, 06, and 07 are complete.

### Files in scope

Modify:

```text
SongBookClient/src/main.js
SongBookClient/styles/app.css
SongBookClient/tests/helpers/testBrowser.mjs
SongBookClient/tests/unit/html-shell.test.mjs
SongBookClient/tests/unit/read-rendering.test.mjs
SongBookClient/docs/song-crud-learning-plan/08-delete-flow.md
```

Add:

```text
SongBookClient/tests/integration/delete-cancel.test.mjs
SongBookClient/tests/integration/delete-failure.test.mjs
SongBookClient/tests/integration/delete-nonselected-busy.test.mjs
SongBookClient/tests/functional/delete-workflow.test.mjs
```

`songsApi.js` should already expose `deleteSong`; change it only if point-04
validation reveals a defect.

### Required UI

Add one Delete button to each song list row and one to the loaded detail
region. Both use the same delete handler and identify the record by
`data-song-id`.

Use a descriptive accessible label:

```text
Delete <song title or "untitled song">
```

Visual button text may remain `"Delete"`.

### Required state and flow

Use `state.deletingSongId` as the only delete-busy state.

`requestSongDeletion(id)` must:

1. Return if another deletion is already pending.
2. Resolve the song display name from `state.songs` or
   `state.selectedSong`.
3. Call `window.confirm()` with:
   `Delete "<name>"? This cannot be undone.`
4. Return without state or network changes when cancelled.
5. Set `deletingSongId`, rerender affected controls, and announce
   `"Deleting song..."`.
6. Await `deleteSong(id)`.
7. On `204`, clear selection when the deleted ID was selected, reload the
   collection, and announce success.
8. On `404`, clear matching selection, reload the collection, and announce
   that the song was already removed.
9. On other failures, preserve list, selection, and details and show an error.
10. Clear `deletingSongId` in `finally`.

Only the target song's Delete controls should be disabled while pending.
Disable Save as well only when the same selected song is being deleted.

### Focus behavior

After successful deletion:

- If another song remains, focus its first View button.
- If the collection is empty, focus `new-song-button`.

After cancellation or failure, leave or restore focus on the Delete button
that initiated the action.

### Acceptance criteria

- [x] Cancel sends no request and changes no application state.
- [x] Confirm sends exactly one `DELETE /songs/{id}`.
- [x] `204` clears the deleted row and selected details after server refresh.
- [x] `404` converges to the same absent state with an informational message.
- [x] Network/500 failure leaves the song visible.
- [x] Repeated clicks cannot create concurrent delete requests.
- [x] Deleting a non-selected song does not clear the current selection.
- [x] Only the target Delete controls are disabled during deletion.
- [x] Save controls lock only when the selected song is being deleted.
- [x] Success, cancellation, and failure move focus to the required control.
- [x] Delete buttons have understandable accessible names.
- [x] Unit, integration, and functional tests cover deletion behavior.
- [x] The delete states and validation commands are documented.

### Validation

```sh
node --check src/main.js
node --check src/songsApi.js
node --test tests/unit/*.test.mjs
node --test tests/integration/*.test.mjs
node --test tests/functional/*.test.mjs
```

The unit layer verifies list/detail Delete controls, destructive styling, and
accessible names including the untitled fallback. The integration layer
verifies cancellation, one-request concurrency, target-only busy state,
selected editor locking, failure preservation, and focus restoration. The
functional layer verifies non-selected and selected `204` deletion plus stale
`404` convergence through the complete UI workflow.

Browser scenarios:

1. Cancel a list-row delete.
2. Delete a non-selected song.
3. Delete the selected song from its detail panel.
4. Delete a song externally, then confirm its stale UI Delete action to test
   `404`.
5. Stop the API before confirming and verify state is retained.
6. Double-click confirmation/action controls and inspect the Network panel for
   one DELETE request.

### Non-goals

- Do not implement optimistic deletion, Undo, soft delete, bulk delete, or a
  custom modal.
- Do not send a DELETE request body.
- Do not remove a row before the API confirms success or absence.

## Recommended first interaction

Use a Delete button on each song row and in the selected-song details. Before
sending the request, ask for confirmation with the song title:

```text
Delete "Amazing Grace"? This cannot be undone.
```

For the first version, `window.confirm()` is acceptable. It is browser-native,
keyboard accessible, and lets you focus on correct request/state behavior.

## Delete flow

```text
Click Delete for a song
  -> find the song ID and display name
  -> ask for confirmation
  -> if cancelled, change nothing
  -> mark this delete action busy
  -> DELETE /songs/{id}
  -> clear selection if it was deleted
  -> refresh the collection from the API
  -> show success notice
```

Use `encodeURIComponent(id)` when the API adapter builds the route. GUIDs are
safe in practice, but encoding is a good general habit for URL path values.

## Why refresh after delete

You could remove the item from `state.songs` immediately. However, fetching
the collection after a successful response is simpler and proves the server's
actual state. It also avoids bugs if future server logic deletes related data
or reorders results.

For this small in-memory API, correctness and clarity are more valuable than
an optimistic update.

## Handle outcomes explicitly

| Outcome | UI behavior |
| --- | --- |
| User cancels confirmation | Do not call the API or change the list. |
| `204 No Content` | Refresh list, clear deleted selection, announce success. |
| `404 Not Found` | Explain it was already removed, then refresh list. |
| Network or `500` error | Keep list and selection unchanged, show failure, re-enable Delete. |

If the selected song is deleted from another browser tab, a later detail load
may return `404`. Reuse the same missing-song recovery behavior from document
06.

## Prevent repeated deletion

While the request is pending:

- Disable the clicked Delete button.
- If there is a global busy flag, avoid blocking unrelated actions longer than
  necessary.
- Do not remove the row before the server confirms success.
- Always restore the disabled control when the request fails.

At this app size, tracking `deletingSongId` is often clearer than one global
`isSaving` flag. It lets only the affected row show a busy state.

## Implementation steps

1. Add a Delete button with a `data-song-id` value to every rendered list row.
2. Use a click listener to identify the correct song without relying on
   displayed title text.
3. Find the current song in `state.songs` for the confirmation wording.
4. Ask for confirmation before invoking `deleteSong(id)`.
5. Set and render a busy state.
6. On success, clear selected state when IDs match and refresh the list.
7. On `404`, refresh anyway because the desired final state is already true.
8. On other failure, preserve state and show an error notice.

## Alternatives

### Native `<dialog>` confirmation

Use a custom confirmation dialog with a Cancel button and a destructive
confirmation button.

- Good for: consistent visual design and richer explanation.
- Trade-off: you must manage focus, Escape, close behavior, and screen-reader
  labels correctly.

Build this only after `window.confirm()` works end-to-end.

### Undo deletion

An Undo button requires either a soft-delete API, a restore endpoint, or a
cached payload that can be recreated with a new ID.

- Good for: user forgiveness.
- Trade-off: the existing API has no undo contract.

Do not advertise Undo until the backend supports it.

### Optimistic deletion

Remove the row before the request completes and put it back if the request
fails.

- Good for: a very responsive interface on slow networks.
- Trade-off: rollback logic and selection recovery add complexity.

Use a server-confirmed refresh first.

## Resources

- [MDN: HTTP `DELETE` method](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Methods/DELETE)
- [MDN: `window.confirm()`](https://developer.mozilla.org/en-US/docs/Web/API/Window/confirm)
- [MDN: `<dialog>`](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/dialog)
- [MDN: HTTP status `404 Not Found`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status/404)

## Checkpoint

You are ready for refinement when cancel does nothing, successful deletion
removes the song after a server refresh, repeated clicks do not create
duplicate requests, and API failures do not falsely remove the song from the
page.
