# 06 - Read Flows

## Goal

Implement both read operations:

```text
GET /songs
GET /songs/{id}
```

The user should see clear loading, empty, populated, selected, and error
states. Do this before creating the editor so the UI already proves that it can
identify the correct song.

This stage follows the mandatory
[testing and documentation policy](00-overall-plan.md#testing-and-documentation-policy).

## AI implementation specification

### Status and prerequisites

This stage is complete. Points 04 and 05 are complete, and the page uses the
static IDs defined in point 05.

### Files in scope

Modify:

```text
SongBookClient/src/main.js
SongBookClient/styles/app.css
SongBookClient/tests/helpers/testBrowser.mjs
SongBookClient/tests/unit/main-structure.test.mjs
SongBookClient/tests/unit/html-shell.test.mjs
SongBookClient/tests/integration/main-api-wiring.test.mjs
SongBookClient/tests/functional/app-shell.test.mjs
SongBookClient/docs/song-crud-learning-plan/06-read-flows.md
```

Add:

```text
SongBookClient/tests/unit/read-rendering.test.mjs
SongBookClient/tests/integration/missing-song.test.mjs
SongBookClient/tests/integration/selection-race.test.mjs
SongBookClient/tests/integration/selection-reconciliation.test.mjs
SongBookClient/tests/functional/read-flow.test.mjs
```

Change `index.html` only when an accessibility label or missing static
container is required; do not restructure the shell.

### Required functions in `main.js`

Organize the read flow around these named functions:

```text
initialize()
loadSongs()
selectSong(id)
clearSelection()
renderSongList()
renderSongDetails()
renderCollectionState()
renderNotice()
```

Small helpers such as `formatSongLabel` or `displayValue` are allowed. Do not
create a generic rendering framework.

### Collection behavior

`loadSongs()` must:

1. Return immediately when `state.isLoadingSongs` is already true.
2. Set `isLoadingSongs`, render the pending state, and disable Refresh.
3. Call `getSongs()`.
4. Replace `state.songs` only after a successful response.
5. Keep the previous list after a failure and mark it as potentially stale.
6. If the selected ID no longer exists in a successful collection response,
   clear selection and details.
7. In `finally`, clear the loading flag and restore controls.

Initial loading and the Refresh button must call this same function.

### List rendering contract

For each song, render one `<li>` containing:

- A text summary: optional number, title fallback `"Untitled song"`, and
  author when present.
- One `View` button with `data-song-id`.
- A selected class when its ID equals `state.selectedSongId`.
- An accessible current indicator such as `aria-current="true"` on the View
  button when selected.

Do not render Delete yet. Do not make the entire list item clickable around a
nested button.

Use event delegation on `song-list` so one listener handles View buttons. Read
the ID only from `data-song-id`, never from displayed text.

### Individual read behavior

`selectSong(id)` must:

1. Store `selectedSongId = id` immediately and rerender selected list state.
2. Set `isLoadingSong` and show `"Loading song details..."`.
3. Capture the requested ID locally.
4. Await `getSong(id)`.
5. Before applying the result, confirm
   `state.selectedSongId === requestedId`.
6. Store the result in `state.selectedSong` and render its details.
7. On `404`, clear selection, explain that the record no longer exists, and
   refresh the collection once.
8. On other failure, retain the selected ID, clear stale detail data, and show
   a retryable error.
9. Clear `isLoadingSong` in `finally` only when the request still belongs to
   the current selection.

The ID comparison is the selected race-condition solution. Do not add
`AbortController` in this stage.

### Detail rendering contract

Render the following labels in `song-details`:

```text
Title
Author
Original title
Number
Key
Tempo
Parts
```

Use `"Not provided"` for null, undefined, or whitespace-only scalar values.
Render parts in array order. Each part shows its name (fallback `"Unnamed
part"`) and text while preserving line breaks with CSS such as
`white-space: pre-wrap`.

Do not display GUIDs in the normal UI. Do not render an Edit button until point
07.

### Acceptance criteria

- [x] Initial and manual collection loads use one function.
- [x] Empty, loading, populated, stale-error, and selected states are visible.
- [x] Every song can be loaded through `GET /songs/{id}`.
- [x] Rapidly selecting A then B cannot leave A in B's detail panel.
- [x] A detail `404` clears stale selection and refreshes the collection once.
- [x] A successful refresh clears a selection missing from the collection.
- [x] Other detail failures retain the selected ID and provide a retry path.
- [x] Null fields never appear as the literal text `"null"`.
- [x] Parts render in API array order and preserve lyric line breaks.
- [x] No user-provided content is assigned to `innerHTML`.
- [x] Unit, integration, and functional tests cover the read behavior.
- [x] The read states and validation commands are documented.

### Validation

```sh
node --check src/main.js
rg "innerHTML" src index.html
node --test tests/unit/*.test.mjs
node --test tests/integration/*.test.mjs
node --test tests/functional/*.test.mjs
```

The unit layer verifies list labels, selected hooks, null fallbacks, literal
markup, ordered parts, multiline lyrics, and duplicate-load prevention. The
integration layer verifies adapter wiring, stale collection failures,
selection reconciliation, individual `404`, and rapid A/B response ordering.
The functional layer exercises collection and individual reads as one user
workflow, including retries and external removal.

Browser scenarios:

1. Load an empty collection.
2. Create sample data through the temporary/API mechanism if needed.
3. View every song.
4. Rapidly alternate between two View buttons.
5. Select a song, delete it through an external curl request, then select or
   refresh it again to exercise `404`.
6. Stop the API and verify the previous list remains with an error notice.

### Non-goals

- Do not create or edit songs.
- Do not add delete controls.
- Do not add filtering, sorting, routing, pagination, or caching.
- Do not use list data as a substitute for `GET /songs/{id}`.

## Collection flow

Use this sequence for initial page load and the Refresh button:

```text
start refresh
  -> set isLoadingSongs to true
  -> render loading state and disable duplicate refresh
  -> await getSongs()
  -> store returned array in state.songs
  -> render list or empty state
  -> clear loading state
  -> render a success or error notice
```

Do not leave old content visible with a misleading "loaded" message after a
request fails. You can either keep the last successful list and show an error,
or clear it and show an error. For this app, keeping the last successful list
is friendlier, as long as the notice clearly says it may be stale.

## List item design

Each list row should provide:

- Human-readable song identity, such as number, title, and author.
- A View action. Edit is added in document 07.
- A visible selected state when its ID equals `state.selectedSongId`.

Make the whole row a button only if there are no nested buttons. If a row also
contains Edit and Delete buttons, use a non-interactive list item with clearly
labelled action buttons instead.

Create user text with DOM methods:

```text
document.createElement(...)
element.textContent = song.title ?? "Untitled song"
```

Never interpolate song titles or lyrics into `innerHTML`. User-provided text
can otherwise become executable markup.

## Detail flow

When a user chooses a song:

```text
click View/Edit for id
  -> record selectedSongId
  -> set isLoadingSong to true
  -> render a detail loading state
  -> await getSong(id)
  -> confirm that it is still the selected ID
  -> store it as selectedSong
  -> render detail and populate editor
```

Fetching the individual resource is intentional even though the list already
contains a song object. It exercises `GET /songs/{id}` and avoids editing a
stale list representation.

## Prevent stale responses

Fast clicking can create a race:

1. The user requests song A.
2. The user immediately requests song B.
3. B responds first.
4. A responds later and incorrectly replaces B in the editor.

For a beginner-friendly solution, compare the requested ID with
`state.selectedSongId` after the request finishes. Ignore the result if it no
longer matches.

An alternative is to use `AbortController` to cancel the first request when a
new selection begins. Learn the ID comparison first; it is easier to inspect.

## Empty and missing states

Plan for these states explicitly:

| State | What the user should see |
| --- | --- |
| First load pending | "Loading songs..." and disabled duplicate controls. |
| Empty array | "No songs yet. Create the first one." |
| One or more songs | A labelled list of selectable rows. |
| Selected song loading | A detail-area loading message, while the list remains usable. |
| `GET /songs/{id}` returns `404` | Clear selection, refresh collection, and explain that the song was removed. |
| Network or `500` error | A clear failure notice and a way to retry. |

Show empty-state guidance now. Document 07 adds a button that invokes the same
create action as the toolbar button.

## Detail display before editing

Show a read-only summary above or beside the form:

```text
Title
Author
Original title
Number
Key
Tempo
Parts in array order
```

This helps you compare the loaded API response with the form values while
developing. It also gives a useful View mode if you later decide not to open
the editor immediately.

For null or blank values, display a consistent placeholder such as
"Not provided". Do not display the literal string `null`.

## Implementation steps

1. Make the initial `loadSongs` use the new `getSongs` adapter.
2. Replace the current list code with DOM-based list rows and stable IDs or
   `data-song-id` attributes.
3. Add the Refresh button behavior.
4. Add a selected-state class based on the selected ID.
5. Add a View/Edit listener that calls `getSong(id)`.
6. Render a detail loading state and then read-only data.
7. Handle a missing selected song by refreshing the list.
8. Test rapid selection to ensure a late response does not show the wrong
   song.

## Alternatives

### Use list data as the editor source

Avoid `GET /songs/{id}` and pass the list object directly into the form.

- Good for: reducing one request.
- Trade-off: the client does not cover the individual-read endpoint and can
  edit stale data.

This is not recommended for the stated CRUD goal.

### Add client-side filtering

A text filter can make larger song lists easier to use.

- Good for: usability once listing works.
- Trade-off: it is extra behavior outside the current API CRUD scope.

Keep it as a later enhancement.

### Use a URL hash for selection

For example, `#song/<id>` can preserve a selected song across refreshes.

- Good for: learning lightweight client-side routing.
- Trade-off: extra parsing and back-button behavior.

Start with in-memory selection first.

## Resources

- [MDN: `dataset`](https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement/dataset)
- [MDN: `textContent`](https://developer.mozilla.org/en-US/docs/Web/API/Node/textContent)
- [MDN: `AbortController`](https://developer.mozilla.org/en-US/docs/Web/API/AbortController)
- [MDN: `aria-current`](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Attributes/aria-current)

## Checkpoint

You are ready to add writing behavior when a user can load a list, choose any
song, see the correct current detail, refresh the collection, and recover
cleanly if a selected song was deleted elsewhere.
