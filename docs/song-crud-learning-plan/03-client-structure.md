# 03 - Client Structure

## Goal

Give the small vanilla JavaScript application clear boundaries before its UI
grows. A simple structure now prevents one large `main.js` file from becoming
hard to debug.

## AI implementation specification

### Status and prerequisites

This stage is pending and requires point 02 to be complete. Point 01 must still
pass its browser checks.

The purpose of this stage is to establish state and module ownership without
building the final page or changing the API contract.

### Files in scope

Modify:

```text
SongBookClient/src/main.js
```

Inspect but do not redesign yet:

```text
SongBookClient/index.html
SongBookClient/src/songsApi.js
SongBookClient/src/factory.js
SongBookClient/src/factories.js
SongBookClient/src/modules/songList.html
```

Do not change API repository files in this stage.

### Required deliverable

Refactor `main.js` around one state object while keeping the existing list and
temporary buttons functional. Use this exact state vocabulary:

```js
const state = {
  songs: [],
  selectedSongId: null,
  selectedSong: null,
  editorMode: "idle",
  isLoadingSongs: false,
  isLoadingSong: false,
  isSaving: false,
  deletingSongId: null,
  draftParts: [],
  notice: null
};
```

Allowed `editorMode` values are `"idle"`, `"create"`, and `"edit"`.
`notice` will later be either `null` or:

```js
{ type: "info" | "success" | "error", message: string }
```

At this stage only `songs` and `isLoadingSongs` need to drive visible behavior;
the other fields establish the shared contract for later stages.

### Required implementation sequence

1. Replace the top-level `let songs = []` binding with the `state` object.
2. Rename `refreshSongs` to `loadSongs` so the function describes the user
   intent and can be reused by initial load and refresh.
3. Make the current list renderer accept an explicit song array and never call
   the API itself.
4. Update temporary button callbacks to use `state.songs`.
5. Keep initial loading in one `initialize()` function called once at module
   startup.
6. Use `const` for bindings that do not change and `for...of` for song
   iteration.
7. Do not cache DOM elements that do not exist until point 05.
8. Do not add form, selection, delete, or user-facing notice behavior yet.

### Acceptance criteria

- [ ] There is exactly one mutable application state object.
- [ ] `main.js` contains no raw `fetch` call.
- [ ] Rendering and loading are separate functions.
- [ ] The existing collection still loads on page startup.
- [ ] Temporary Get/Create/Refresh behavior still works.
- [ ] No unused module is deleted while `main.js` imports it.
- [ ] There are no unhandled promise rejections during the happy path.

### Validation

```sh
node --check src/main.js
node --check src/songsApi.js
```

Run lite-server, load the page, create the existing sample song, and refresh
the visible list.

### Non-goals

- Do not add `src/config.js`; the single API URL stays in `songsApi.js`.
- Do not add `songForm.js` until point 07.
- Do not create the final app shell or CSS layout.
- Do not remove `factory.js`, `factories.js`, or `modules/songList.html` yet.
- Do not add a framework, package manifest, or dependency.

## Recommended module responsibilities

| File | Responsibility | Should not do |
| --- | --- | --- |
| `index.html` | Semantic page structure and module entry point. | Contain application logic or inline event handlers. |
| `src/main.js` | State, DOM rendering, form events, and calls to the API adapter. | Contain raw `fetch` calls. |
| `src/songsApi.js` | Base URL, HTTP requests, response parsing, and API errors. | Query or modify the DOM. |
| `src/songForm.js` (point 07) | Form population, payload construction, and part editor helpers. | Call the API or own page-level state. |
| `styles/app.css` | Page, list, form, and feedback styles. | Hide important state only with color. |
| `styles/buttons.css` | Existing shared button styles, if still useful. | Become the only place for all layout rules. |

You do not need a module for every button or every HTML element. Add a file
only when a responsibility is genuinely separate and understandable by name.

## Recommended state model

Start with one plain object in `main.js`:

```js
const state = {
  songs: [],
  selectedSongId: null,
  selectedSong: null,
  editorMode: "idle",
  isLoadingSongs: false,
  isLoadingSong: false,
  isSaving: false,
  deletingSongId: null,
  draftParts: [],
  notice: null
};
```

This is not a framework. It is simply a place to record what the page needs to
show. Every event changes state, then calls focused rendering functions.

For example:

```text
Click a row
  -> set selectedSongId
  -> load that song
  -> set selectedSong
  -> render detail and form
```

Avoid keeping the same fact in multiple places. If the selected ID is in
`state`, do not also rely on a hidden input as the source of truth.

## Rendering approach

Use small explicit functions such as:

```text
renderSongList()
renderSongDetails()
renderEditor()
renderNotice()
setBusyControls()
```

Each function should receive data or read the state it needs and update one
well-named container. `replaceChildren()` is a good fit for a small list: it
clears old elements and makes a fresh DOM tree without string HTML templates.

Use event listeners in JavaScript, not `onclick="..."` attributes in HTML.
For a song list, either attach listeners to each button as it is created or
use one delegated click listener on the list container.

## Existing files to treat carefully

- `src/factory.js` exports the current button factory and remains required
  until point 05 replaces dynamically appended controls with static HTML.
- `src/factories.js` is not imported by the current page.
- `src/modules/songList.html` is not loaded by the current page.

Do not build new features on unused files merely because they exist. Point 05
removes all three files after confirming no imports or HTML references remain.

## Implementation steps

1. Draw the data flow on paper: UI event -> `main.js` -> `songsApi.js` -> API
   -> `main.js` -> DOM.
2. Keep the single base API URL in `songsApi.js`.
3. Replace temporary global-style variables with the single `state` object.
4. Record the stable HTML IDs required by point 05; do not add the final shell
   during this structural refactor.
5. Split the existing `populateSongs` code into a renderer that does not fetch
   data itself.
6. Keep all network calls inside named async functions such as
   `loadSongs`, `selectSong`, and `saveSong`.
7. Name functions by user intent rather than DOM mechanics:
   `beginCreateSong` is clearer than `showFormDiv`.

## Naming guidelines

- Use verbs for actions: `loadSongs`, `createSong`, `deleteSong`.
- Use nouns for data: `song`, `songs`, `songPayload`.
- Use booleans that read as true or false: `isSaving`, `hasUnsavedChanges`.
- Prefer `const`; use `let` only when a binding must change.
- Use `===` rather than `==`.
- Keep URL construction in one place.

## Alternatives

### One `renderApp()` function

For a very small page, one function can replace the whole application DOM from
the current state.

- Good for: learning unidirectional rendering.
- Trade-off: rebuilding form DOM can discard typed text and focus unless you
  handle it carefully.

### Multiple targeted renderers

Render only the list, details, editor, or notice that changed.

- Good for: preserving form input and making DOM behavior explicit.
- Trade-off: you must ensure related regions update together.

For this project, multiple small renderers are the easier starting point.

### A framework

React, Vue, or similar tools solve state and rendering problems at scale, but
they add a build system and concepts unrelated to the CRUD task. Learn the
browser primitives first; you can later compare the same design with a
framework.

## Resources

- [MDN: JavaScript modules](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules)
- [MDN: `replaceChildren()`](https://developer.mozilla.org/en-US/docs/Web/API/Element/replaceChildren)
- [MDN: `addEventListener()`](https://developer.mozilla.org/en-US/docs/Web/API/EventTarget/addEventListener)
- [MDN: Event bubbling](https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/Scripting/Event_bubbling)

## Checkpoint

Before adding forms, you should be able to point to exactly one module that
owns HTTP behavior, one place that owns UI state, and one named container for
each major page region.
