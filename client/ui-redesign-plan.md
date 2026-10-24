# UI Redesign Implementation Plan

> Status: approved, not started. Prepared 2026-10-24.
>
> Baseline: branch `feature/copilot-experimentation`, commit `5b47c43`. The
> worktree also contained uncommitted work: server PDF font embedding and a
> PDF download filename change in `client/src/main.js` (`pdfDownloadName` adds
> a `chords`/`lyrics` suffix). That work must be committed before Phase 0
> (see section 1) and ported as it is, not reverted.
>
> Audience: an AI coding agent or developer who implements the redesign phase
> by phase. Read sections 1-9 completely before writing code.

## Progress

Update this table at the end of every phase.

| Phase | Scope | Status | Commit | Notes |
| --- | --- | --- | --- | --- |
| 0 | Baseline and branch | Not started | | |
| 1 | Server: song search and adjacent songs | Not started | | |
| 2 | Test infrastructure and API modules | Not started | | |
| 3 | App shell, router, auth, library | Not started | | |
| 4 | Book and song screens | Not started | | |
| 5 | Song editor with inline chords | Not started | | |
| 6 | PDF and share screens | Not started | | |
| 7 | User management screen | Not started | | |
| 8 | Polish, cleanup, documentation | Not started | | |

## 1. Start here

1. Run `git status`. If any file this plan rewrites or deletes (anything under
   `client/`, `server/README.md`, or `SongEndpoints.cs`, `ISongService.cs`,
   or `EfSongRepository.cs`) has uncommitted changes, stop and ask the user to
   commit them first. Never revert, reformat, or commit someone else's
   unrelated changes as part of this work.
2. Create branch `feature/ui-redesign` from the current branch. Do not merge or
   push without the user's approval. The app is allowed to be incomplete
   between phases on this branch.
3. Tools: .NET 10 SDK and Node.js 22 or newer. There is no npm install step.
   Run from the repository root:

   ```sh
   dotnet test server/SongBookApi.slnx
   node --test client/tests/unit/*.test.mjs client/tests/integration/*.test.mjs client/tests/functional/*.test.mjs
   ```

   Node expands these globs itself, so the command also works in PowerShell.
   Run the app with the command in the root `README.md` and open
   `https://localhost:7152/`.
4. Implement the phases in order (section 10). A phase is complete when its
   acceptance criteria pass, both test suites are green, the Progress table is
   updated, and the phase is committed with a descriptive message.
5. If the code disagrees with a fact in this plan (for example, line numbers
   drifted), trust the code for facts and this plan for desired behavior.
   Record deliberate deviations in the Progress table's Notes column.
6. Do not add features, settings, screens, or dependencies that this plan does
   not specify.

## 2. Goal and approved decisions

Replace the single crowded page, where book list, book administration, PDF
exports, collaborators, song list, and song editor are all visible at once,
with a minimal app in which every screen shows exactly one subject and only
the actions for that subject.

| Topic | Decision |
| --- | --- |
| Navigation model | Drill-down pages: Library → Book → Song. One centered column on all devices. |
| Global navigation | App bar with brand link (home), breadcrumb, and account menu. Nothing else is global. |
| Book actions | Only on book screens: Add song (Editor+), PDF (everyone), `⋯` menu (Owner: Share, Rename, Delete). |
| Song editing | Full-screen focus mode: the app bar is hidden and the editor bar only has Cancel and Save. |
| Chord entry | Inline brackets in the lyrics: `[G]Amazing [D7]grace`. Replaces the cursor-based chord tool. |
| Song search | Server-side `search` parameter on the song list. Matches title, original title, author, and number. Case- and diacritic-insensitive. Every word must match. |
| Previous/next | On the song screen, in the book's canonical order (title, then ID; the same order as the list and PDFs). New adjacent-songs endpoint. Left/Right arrow keys. |
| URLs | Hash routes. Back, Forward, and reload keep the user's place; links are shareable. |
| Lists | "Show more" appends the next 50 items. No page controls. |
| Refresh buttons | Removed. Each screen loads fresh data when opened. |
| Feedback | One status region. Routine loads are silent. Success messages hide automatically; errors stay until dismissed or the next navigation. |
| Confirmations and prompts | One reusable native `<dialog>`. No `window.confirm`. |
| Overflow menus | Disclosure button with a panel (`aria-expanded`). |
| Unsaved editor changes | Kept in memory when the user navigates away; Cancel asks before discarding; the browser unload prompt protects reloads. |
| UI language | English text, as today. Brand: "Śpiewnik SpoTkanie". |
| Out of scope | Lyrics search, font-size controls, presentation mode, dark mode, offline use, translations, new roles or settings, changing the song order. |

## 3. Non-negotiable constraints

- **No dependencies.** No framework, bundler, npm package, or
  `package.json`. Vanilla ES modules loaded by
  `<script type="module" src="src/main.js"></script>`.
- **Keep entry paths.** `client/index.html`, `client/src/main.js`, and
  `client/styles/app.css` must keep these names: server tests request
  `/src/main.js` and `/styles/app.css`, and `deploy/publish.sh` copies
  `index.html`, `src/`, and `styles/` recursively. New modules live in
  subfolders of `client/src/`; stylesheets stay in `client/styles/`.
- **CSP.** `Program.cs` sends `default-src 'self'; ... script-src 'self';
  style-src 'self'`. Therefore: no inline `<script>` or `<style>`, no `style`
  attributes, no `setAttribute("style", ...)`, no `on*=` attributes, and no
  external fonts or images. Style only through classes in the stylesheets.
- **Security test rules** (kept and extended in Phase 2): no `localStorage` or
  `sessionStorage`; no hard-coded origins; `fetch(` only in
  `src/httpClient.js`; never log passwords, codes, or tokens.
- **Text, never markup.** Render user content with `textContent` or
  `document.createTextNode`. Never use `innerHTML`, `outerHTML`,
  `insertAdjacentHTML`, or `document.write`.
- **Native, accessible controls.** Links (`<a href="#/...">`) navigate;
  buttons (`<button type="...">`, always with an explicit `type`) act. Every
  input has a visible `<label>`. One `<h1>` per screen and a logical heading
  order. No positive `tabindex`. Targets are at least 44×44 CSS pixels.
  Visible `:focus-visible` outline. Usable at 320 CSS pixels and at 200 %
  zoom. Selected or pressed states do not rely on color alone.
- **No module-level mutable app state.** All state lives in objects created by
  `startApp()` (section 7.2), so tests can start a fresh app per test. The
  only allowed exception is the existing antiforgery-token cache in
  `httpClient.js`, which `startApp()` resets.
- **No DOM globals at import time.** Never read or cache `window` or
  `document` at module top level; read them inside functions.
- **Code style.** Match the existing client: 4-space indentation, no
  semicolons, double quotes, `function` declarations, named exports, early
  returns. Keep modules focused; aim for fewer than about 400 lines each.
- **API contract.** The only API changes are the two additive endpoints in
  section 6. Do not change existing request or response shapes.

## 4. What exists today

| Path | Today | Plan |
| --- | --- | --- |
| `client/index.html` | Static markup for every panel (about 32 KB). | Replace the body with the seven-element shell in section 7.2 (Phase 3). |
| `client/src/main.js` | About 6,050 lines: one global `state` object, all flows, all rendering. | Replace with a short bootstrap (Phase 3); port behaviors listed in section 8. |
| `client/src/songForm.js` | DOM-based song form and cursor chord editor. | Delete in Phase 3; recreate in Phase 5 as a pure model/payload module. |
| `client/src/chords.js` | `isChordAnchor`, `adjustChordsForTextEdit`, `renderChordedText`. | Keep `isChordAnchor` and `renderChordedText`; delete `adjustChordsForTextEdit` in Phase 5. |
| `client/src/pagination.js` | `pageUrl`, `readPage`, `fetchAvailablePage`, `renderPageControls`. | Keep and extend `pageUrl`; keep `readPage`; delete the other two in Phase 8 if unused. |
| `client/src/httpClient.js` | `request`, `ApiError`, antiforgery handling. | Keep unchanged. |
| `client/src/songsApi.js` | Song CRUD wrappers. | Add `search`, `signal`, and `getAdjacentSongs` (Phase 2). |
| `client/src/songBooksApi.js` | Books, access, PDFs. | Add optional `signal` to GET wrappers (Phase 2). |
| `client/src/authApi.js` | Auth wrappers. | Keep. |
| `client/src/moderationApi.js` | Moderation wrappers. | Add optional `signal` to the GET wrapper (Phase 2). |
| `client/styles/app.css` | Panel-based layout. | Rewrite (Phases 3-8). |
| `client/styles/buttons.css` | `.button` with primary, neutral, destructive, and link variants. | Keep; adjust as needed. |
| `client/tests/` | 55 files, 99 tests, fake DOM in `helpers/testBrowser.mjs`. | Disposition in section 9.4. |

Where to find old behavior while porting (function names in the old
`main.js`). Read them before deleting the file in Phase 3. Record the last
commit that still contains the old `main.js` in the Phase 3 notes, and use
`git show <that commit>:client/src/main.js` afterwards:

- Auth: `loadAuthState`, `handleLogin`, `handleRegistration`,
  `handleResendConfirmation`, `handleForgotPassword`, `handleResetPassword`,
  `handleLogout`, `handleAuthQuery`, `getAuthValidationMessage`.
- Failure handling: `handleAuthenticationFailure`, `handleSelectedBookFailure`,
  `handleAmbiguousSongNotFound`, `handleMutationAuthorizationFailure`.
- Drafts: `captureCurrentSongDraft`, `restorePreservedSongDraft`.
- Books: `loadSongBooks`, `selectSongBook`, `saveSongBook`,
  `requestSongBookDeletion`, `saveSongBookMember`,
  `requestSongBookMemberRemoval`.
- Songs: `loadSongs`, `selectSong`, `saveSong`, `requestSongDeletion`.
- PDFs: `loadSongBookPdfs`, `generateSongBookPdf`, `downloadPdf`,
  `readPdfMetadata`, `pdfDownloadName`.
- Moderation: `loadManagedUsers`, `handleManagedUserAction`,
  `readManagedUsers`, `renderUserManagement` (permission rules).
- Messages: every `get...ErrorMessage` function, `getSafeApiDetail`,
  `getApiDetailCandidates`, `toSentence`, `getPostSaveNotice`.
- Helpers: `displayValue`, `normalizeAccessLevel`, `formatAccessLevel`,
  `formatSongLabel`.

## 5. UX specification

Wireframes are in Appendix A. Element IDs below are stable hooks for tests
and must be used exactly.

### 5.1 Global rules

1. One screen = one subject = one URL.
2. The app bar never shows screen-specific actions.
3. Each screen has one `<h1 id="screen-heading" tabindex="-1">`, at most one
   primary action, secondary actions as plain links/buttons, and rare or
   destructive actions inside a `⋯` menu.
4. Controls that the user's role cannot use are not rendered.
5. No manual refresh. Screens fetch on entry. Back/Forward may restore the
   book list from a snapshot (section 7.9).
6. Lists show 50 items and a "Show more" button while more exist.
7. Routine loads produce no status message. Only outcomes of user actions,
   lost access, and failures are announced.
8. Empty values are omitted. Never show "Not provided".
9. Song editing is a focus mode (section 5.5.6).
10. Losing access returns to the nearest valid screen with one message.
11. Everything works with the keyboard alone. After every navigation except
    the first page load, focus moves to the new screen's heading (or the
    screen's declared focus target).
12. `document.title` is `{subject} · {book, when relevant} · Śpiewnik
    SpoTkanie`, for example `Amazing Grace · Sunday Service · Śpiewnik
    SpoTkanie`.

### 5.2 Routes

| Route (hash) | Screen module | Minimum access | Requests on entry |
| --- | --- | --- | --- |
| `#/` (also an empty hash) | `libraryScreen` | Signed in | `GET /songbooks` |
| `#/books/{bookId}` and `#/books/{bookId}?q={text}` | `bookScreen` | Reader | `GET /songbooks/{id}` and `GET .../songs[?search=]` in parallel |
| `#/books/{bookId}/songs/new` | `songEditorScreen` (create) | Editor | `GET /songbooks/{id}` |
| `#/books/{bookId}/songs/{songId}` | `songScreen` | Reader | Book, song, and adjacent songs in parallel |
| `#/books/{bookId}/songs/{songId}/edit` | `songEditorScreen` (edit) | Editor | Book and song in parallel |
| `#/books/{bookId}/pdfs` | `pdfListScreen` | Reader | Book and PDFs in parallel |
| `#/books/{bookId}/pdfs/new` | `pdfNewScreen` | Owner | Book; songs once "Choose songs" is selected |
| `#/books/{bookId}/share` | `shareScreen` | Owner | Book and collaborators in parallel |
| `#/users` | `usersScreen` | Moderator or SuperUser | `GET /admin/users` |
| Anything else | `notFoundScreen` | Anyone | None |

Routing rules:

- Match `songs/new` and `pdfs/new` before their parameterized siblings.
- Build every hash with the router's `href()` helper, which applies
  `encodeURIComponent` to IDs and query values. Decode when matching; a
  malformed escape renders Not found.
- Unknown query parameters are ignored. Only the book route reads `q`.
- Session `loading` renders a loading view; `anonymous` renders the auth
  screen for every route and keeps the hash, so the requested screen renders
  after sign-in; `unavailable` renders the unavailable view (5.5.2).
- If the role is insufficient for a route, navigate with `replace` to the
  closest allowed screen and show the matching message from section 5.7.

### 5.3 Permissions

| Capability | Reader | Editor | Owner |
| --- | --- | --- | --- |
| Library, create song books | Yes | Yes | Yes |
| Open book, search, read songs, chords toggle, previous/next | Yes | Yes | Yes |
| PDF list and download | Yes | Yes | Yes |
| Add, edit, delete songs | No | Yes | Yes |
| New PDF | No | No | Yes |
| Share, rename book, delete book | No | No | Yes |

- Book role comes from `accessLevel` in `GET /songbooks/{id}` (`reader`,
  `editor`, `admin`; normalize with the ported `normalizeAccessLevel`).
  `admin` is the owner.
- Manage users is available to Moderator and SuperUser accounts
  (`/auth/me` `role`), independent of book roles. It never grants book
  access.
- The API remains the authority. A hidden control is a convenience, not a
  permission check.

### 5.4 App bar and account menu

Static shell element `<header id="app-bar" class="app-bar">` contains:

- `#app-home-link`: `<a href="#/">Śpiewnik SpoTkanie</a>` (brand, always
  visible).
- `#app-breadcrumb`: `<nav aria-label="Breadcrumb">` with an `<ol>`, filled per
  route. Ancestor items are links; the last item is
  `<span aria-current="page">`.

  | Route | Breadcrumb after the brand |
  | --- | --- |
  | Library, Not found | (empty) |
  | Book | Book name (current) |
  | Song | Book name (link) › Song title (current) |
  | PDF list | Book (link) › PDF exports (current) |
  | New PDF | Book (link) › PDF exports (link) › New PDF (current) |
  | Share | Book (link) › Share (current) |
  | Users | Users (current) |

  Below 40rem, CSS hides every crumb except the nearest ancestor link and
  shows it as `‹ {name}`. When there is no ancestor, nothing is shown.
- `#account-menu`: rendered only when signed in. The disclosure button
  `#account-menu-button` shows the email (truncated with an ellipsis by CSS).
  The panel `#account-menu-panel` contains "Signed in as {email}" with
  " (Moderator)" or " (SuperUser)" when applicable, the link
  `#manage-users-link` "Manage users" (Moderator/SuperUser only) to
  `#/users`, and the button `#sign-out-button` "Sign out".

While the session is loading or signed out, only the brand is shown. On editor
routes the whole `#app-bar` is `hidden` (focus mode).

### 5.5 Screens

Every screen renders into `<main id="screen">`; the router sets
`main.dataset.screen` to the screen name shown in each heading below.

#### 5.5.1 Auth (`auth`)

A centered card. The `<h1>` names the current view. Views switch in place;
the hash does not change.

| View | `<h1>` | Form and fields (IDs) | Submit | Links (buttons with `data-auth-view`) |
| --- | --- | --- | --- | --- |
| `login` (default) | Sign in | `#login-form`: `#login-email`, `#login-password`, checkbox `#login-remember-me` "Keep me signed in" | Sign in | "Forgot password?" → `forgot-password`; "Resend confirmation email" → `resend-confirmation`; "New here? Create an account" → `register` |
| `register` | Create account | `#register-form`: `#register-email`, `#register-password` (minlength 12), `#register-confirm-password` | Create account | "Already have an account? Sign in" → `login` |
| `forgot-password` | Forgot password | `#forgot-password-form`: `#forgot-password-email` | Send reset email | "Back to sign in" → `login` |
| `resend-confirmation` | Resend confirmation | `#resend-confirmation-form`: `#resend-confirmation-email` | Send confirmation email | "Back to sign in" → `login` |
| `reset-password` | Reset password | `#reset-password-form`: `#reset-password-email` (readonly), `#reset-password-new-password`, `#reset-password-confirm-password` | Reset password | "Back to sign in" → `login` |

- Field `name`, `type`, and `autocomplete` values are the same as in today's
  `index.html` (`email`/`username`, `password`/`current-password` or
  `new-password`, `rememberMe`, `confirmPassword`, `newPassword`).
- API calls, client-side validation (password confirmation must match), and
  messages are ported unchanged from the old handlers (section 4).
- While a request runs, every control in the form is disabled and the form
  has `aria-busy="true"`.
- Switching views focuses the first field of the new view.
- After sign-in: `resetAntiforgeryToken()`, reload the session, clear drafts
  that belong to another account (7.8), and re-render the current route.
  The status is "Signed in." or, when the editor restored a draft, "Signed
  in. Your unsaved song draft was restored."
- After registration: switch to `login`, prefill the email, and keep the
  ported success message.
- Email links: `?auth=confirmed`, `?auth=confirmation-failed`, and
  `?auth=reset-password&email=...&code=...` are handled at startup exactly as
  `handleAuthQuery` does today (messages, reset credentials, and removal of
  `auth`, `email`, and `code` via `history.replaceState`, keeping the hash). A
  valid reset link shows the `reset-password` view even when a session exists;
  after a successful reset, show `login` with the email prefilled.

#### 5.5.2 Loading and unavailable views

- `loading`: shown while `/auth/me` is pending. A visually hidden `<h1>`
  "Loading" and the visible text "Loading…". No app-bar menu.
- `unavailable`: shown when `/auth/me` fails for a reason other than 401.
  `<h1>` "Can't reach SongBook", the text "Check your connection and try
  again.", and the button `#retry-session-button` "Try again", which reloads
  the session and re-renders.

#### 5.5.3 Library (`library`)

- `<h1>` "Song books". Primary button `#new-song-book-button` "New song book".
- `<ul id="song-book-list" class="row-list">`. Each item is a
  `<li><a class="row-link" href="#/books/{id}" data-song-book-id="{id}">` with
  the name (fallback "Untitled song book") and a meta line: "{n} songs"
  ("1 song"), plus " · Shared with you (Reader)" or " · Shared with you
  (Editor)" when `accessLevel` is not `admin`.
- `#song-book-list-state` shows "Loading song books…", the empty text
  "No song books yet. Create your first one.", or an error with a
  "Try again" button.
- `#show-more-song-books` "Show more" (accessible name "Show more song
  books") is shown while `hasNext`.
- New song book: prompt dialog (5.6.1) with title "New song book", label
  "Name", `maxLength` 100, required, and confirm label "Create". A 409
  keeps the dialog open and shows "You already have a song book with that
  name. Choose a different name." On success, navigate to the new book and
  show "Song book created."
- Title: `Song books · Śpiewnik SpoTkanie`.

#### 5.5.4 Book (`book`)

- `<h1>` book name. `#book-meta`: "{n} songs", plus " · Shared with you
  ({Reader or Editor})" for non-owners.
- Action row:
  - `#add-song-link` (Editor+, primary style): "Add song" →
    `#/books/{id}/songs/new`.
  - `#pdf-link` (everyone): visible text "PDF", accessible name "PDF exports",
    → `#/books/{id}/pdfs`.
  - `#book-menu-button` (Owner only): visible "⋯", accessible name "More book
    actions". Panel `#book-menu` contains the link `#share-link` "Share" →
    `#/books/{id}/share`, the button `#rename-book-button` "Rename", and the
    destructive button `#delete-book-button` "Delete song book".
- Search: `<form id="song-search-form" role="search">` with the visible label
  "Search songs" and `<input id="song-search" type="search" maxlength="100"
  placeholder="Title, author or number">`. There is no submit button; Enter
  submits.
  - `input` events start a 300 ms debounce; submit searches immediately. Do
    nothing if the trimmed text equals the active search.
  - Searching resets the list to page 1, aborts the previous list request,
    and updates the hash query `q` with `replaceState` (no history entry, no
    re-render). An empty search shows the full list and removes `q`.
  - On entry with `?q=`, prefill the input and load the filtered list.
- `<ul id="song-list" class="row-list">`. Each item is
  `<li><a class="row-link song-row" href="#/books/{b}/songs/{s}" data-song-id="{s}">`
  containing `.song-row__number` (number or empty), `.song-row__title` (title
  or "Untitled song"), and `.song-row__author` (author; hidden below 32rem).
- `#song-list-state`: "Loading songs…"; for an empty book, "No songs yet." and
  for Editor+ the link "Add the first song"; for no matches, `No songs match
  "{q}".`; for errors, the message and a "Try again" button.
- `#show-more-songs` "Show more" (accessible name "Show more songs").
- Rename: prompt dialog with title "Rename song book", the current name
  prefilled, and confirm label "Save". Handle 409 as in 5.5.3. On success,
  update the `<h1>`, breadcrumb, and document title, and show "Song book
  renamed."
- Delete: confirm dialog (5.6.1) with title "Delete song book?", the message
  `Delete "{name}" and all of its songs and access entries? This cannot be
  undone.`, and the destructive confirm "Delete song book". On success, drop
  the book's caches, call `goBackOr("/")`, and show "Song book deleted."
- Restore the list snapshot on Back/Forward (7.9).
- Title: `{book} · Śpiewnik SpoTkanie`.

#### 5.5.5 Song (`song`)

- `<h1>`: title or "Untitled song".
- `#song-meta`: non-empty values joined with " · " in this order: author,
  `Key {key}`, tempo, `No. {number}`. Omitted when all are empty. If the
  original title exists, `#song-meta-original` shows "Original title: {value}".
- Actions:
  - `#chords-toggle`, only when at least one part has chords:
    `<button type="button" aria-pressed="true|false">Chords</button>`. The
    preference `ctx.prefs.showChords` (default `true`) lasts for the session
    and applies to every song. No storage.
  - `#edit-song-link` (Editor+): "Edit" → `#/books/{b}/songs/{s}/edit`.
  - `#song-menu-button` (Editor+): visible "⋯", accessible name "More song
    actions". Panel `#song-menu` contains the destructive button
    `#delete-song-button` "Delete song".
- `#song-parts`: one `<section class="song-part">` per part, in order. If the
  part name is not empty, it is an `<h2 class="song-part__name">`. Lyrics:
  when chords are shown and the part has chords, use `renderChordedText()` in
  a `<div class="chorded-text">`; otherwise use `<p class="song-part__text">`
  with `textContent` (CSS `white-space: pre-wrap`). A song without parts shows
  "This song has no lyrics yet."
- Pager `<nav id="song-pager" aria-label="Song navigation">`:
  `#previous-song-link` "‹ {title}" (accessible name "Previous song: {title}")
  and `#next-song-link` "{title} ›" (accessible name "Next song: {title}").
  A missing side is not rendered. Both use `navigate(..., { replace: true })`
  so Back returns to the book. If the adjacent request fails, hide the pager
  without a message.
- Keyboard: ArrowLeft/ArrowRight go to the previous/next song when no modifier
  key is pressed, focus is not in an input, textarea, or select, and no dialog
  or menu is open.
- Delete: confirm dialog with title "Delete song?", the message
  `Delete "{title}"? This cannot be undone.`, and confirm "Delete song". On
  success, invalidate the book snapshot, call `goBackOr(bookPath)`, and show
  "Song deleted." A 404 also returns to the book, with "This song was already
  deleted."
- A 404 on `GET song` navigates with `replace` to the book and shows "This
  song no longer exists. It may have been deleted." First re-check the book:
  if the book also fails, apply the lost-book rule (7.6), as
  `handleAmbiguousSongNotFound` does today.
- Title: `{song} · {book} · Śpiewnik SpoTkanie`.

#### 5.5.6 Song editor (`song-editor`)

Focus mode: `#app-bar` is hidden and the whole screen is
`<form id="song-editor-form" novalidate>`.

- Sticky editor bar: `#editor-cancel-button` (`type="button"`) "Cancel", a
  title ("New song" or "Edit song") with the book name in smaller text, and
  `#editor-save-button` (`type="submit"`) "Save". While saving, the Save text
  is "Saving…" and the form has `aria-busy="true"` and disabled controls.
- `#editor-status` (`role="status"`) shows form-level messages.
- Fields: `#song-title` (`name="title"`, label "Title"). A disclosure button
  `#more-details-button` "More details" (`aria-expanded`,
  `aria-controls="more-details"`) reveals `#more-details` with `#song-author`,
  `#song-original-title`, `#song-number`, `#song-key`, and `#song-tempo`
  (labels "Author", "Original title", "Number", "Key", "Tempo"; names as in
  today's form). The disclosure starts open when any of those fields has a
  value.
- Parts: `#parts-editor` contains one
  `<fieldset class="part-editor" data-part-key="{key}">` per part:
  - `<legend>Part {n}</legend>`.
  - Name input: label "Part name", `data-part-field="name"`, placeholder
    "e.g. Verse 1".
  - Textarea: label "Lyrics and chords", `data-part-field="text"`, monospace,
    `spellcheck="false"`. Set `rows` to the line count plus one (minimum 4) on
    every input. Use the `rows` attribute, not inline style.
  - Error paragraph `#part-error-{key}` (hidden when empty), referenced by the
    textarea's `aria-describedby`.
  - Part menu: visible "⋯" with accessible name "Part {n} actions", containing
    "Move up" (`data-action="move-part-up"`, absent for the first part),
    "Move down" (`move-part-down`, absent for the last part), and
    "Remove part" (`remove-part`, destructive).
  - Below everything: `#add-part-button` "Add part", which appends an empty
    part and focuses its name input.
- `#chord-hint` (always visible, muted) has exactly this text:
  `Put chords in square brackets right before the syllable: [Am]Amazing [D7]grace. Type \[ for a literal bracket.`
- New song: one empty part. Edit: fields and parts come from the song (7.11).
- Dirty tracking: compare the current editor model with the model captured
  after loading.
- Save (7.11 has the payload rules):
  1. Parse every part. On notation errors, show them in each part's error
     paragraph ("Line {n}: {message}"), focus the first failing textarea, set
     `#editor-status` to "Fix the chord brackets marked below.", and stop.
  2. Create: `POST`, delete the draft, invalidate the book snapshot,
     `navigate(songPath(newId), { replace: true })`, and show "Song created."
  3. Edit: `PUT`, delete the draft, invalidate the book snapshot,
     `goBackOr(songPath)`, and show "Song saved."
  4. Errors (7.6): 400 shows a message with safe API detail in
     `#editor-status` and keeps the form. 401 keeps the draft and starts the
     session-ended flow. 403 re-fetches the book; if the role is no longer
     Editor, show "Your account is not allowed to make this change. Your song
     data was kept." and keep the form. 404 on edit shows "This song was
     deleted by someone else. Copy anything you need, then cancel." and keeps
     the form.
- Cancel: if dirty, show a confirm dialog with title "Discard changes?", the
  message "Your unsaved changes will be lost.", the destructive confirm
  "Discard changes", and cancel "Keep editing". Then delete the draft and call
  `goBackOr(songPath or bookPath)`. If not dirty, leave immediately.
- Leaving any other way (Back, a hash edit, session end) while dirty keeps
  the draft (7.8). After the next screen renders, show the info status
  `Unsaved changes to "{title or Untitled song}" were kept.` with the action
  link "Continue editing" to the editor route.
- While dirty, a `beforeunload` handler calls `preventDefault()`.
- Entering with a stored draft for the same account and key: verify Editor
  access (and, for edit, that the song exists), load the draft instead of
  server data, and show `#draft-restored-notice` "Restored your unsaved
  changes." with the button `#discard-draft-button` "Discard them", which
  deletes the draft and re-renders from the server.
- Without Editor access: navigate with `replace` to the song (edit) or the
  book (create) and show "You need Editor access to change songs in this
  book."
- Focus: `#song-title` after load. Title: `New song · {book} · Śpiewnik
  SpoTkanie` or `Edit {song} · Śpiewnik SpoTkanie`.

#### 5.5.7 PDF exports (`pdfs`)

- `<h1>` "PDF exports". Owner: primary link `#new-pdf-link` "New PDF" →
  `#/books/{id}/pdfs/new`.
- `<ul id="pdf-list">`. Each `<li class="pdf-item" data-pdf-id="{id}">` has:
  - `.pdf-item__title`: "Entire book · with chords" or "Entire book · lyrics
    only"; for selections, "{n} selected songs · ..." ("1 selected song").
  - `.pdf-item__songs` (selections only): the first three titles joined with
    ", ", plus " and {k} more" when needed.
  - `.pdf-item__meta`: `<time datetime="{generatedAtUtc}">Created
    {toLocaleString()}</time>` and, when outdated, the badge "Outdated" with
    the text "The book changed after this PDF was created."
  - A "Download" button (`data-action="download-pdf"`, accessible name
    "Download PDF created {date}").
- `#pdf-list-state`: "Loading PDF exports…", the empty text "No PDFs yet."
  (Owner: also the link "Create the first PDF"), or an error with "Try again".
- `#show-more-pdfs` "Show more" (accessible name "Show more PDFs").
- Download: port `downloadPdf` (7.12). Only one download at a time: all
  Download buttons are disabled while one runs. Errors use the ported
  `getDownloadPdfErrorMessage`.
- Validate list items with the ported `readPdfMetadata`.
- Title: `PDF exports · {book} · Śpiewnik SpoTkanie`.

#### 5.5.8 New PDF (`pdf-new`, Owner only)

- Non-owners: navigate with `replace` to the PDF list and show "Only the owner
  can create PDFs."
- `<h1>` "New PDF". `<form id="pdf-form">`:
  - `<fieldset>` with legend "Songs": radios (`name="scope"`)
    `#pdf-scope-whole` "Entire book" (checked) and `#pdf-scope-selected`
    "Choose songs".
  - Checkbox `#pdf-include-chords` "Include chords" (checked).
  - `#pdf-song-picker` (hidden unless "Choose songs"): a search input
    `#pdf-song-search` with the same debounce and API as the book search, a
    checklist `#pdf-song-list` (`<li><label><input type="checkbox"
    data-song-id> {number} {title}</label></li>`), `#show-more-pdf-songs`, and
    `#pdf-selection-count` (`role="status"`: "No songs selected" or "{n}
    songs selected"). Selection is a `Map` of ID to title that survives
    searches and "Show more".
  - `#pdf-form-error` (hidden when empty).
  - Actions: link `#cancel-pdf-link` "Cancel" (to the PDF list) and submit
    `#create-pdf-button` "Create PDF".
- Submit: with "Choose songs" and nothing selected, show "Choose at least one
  song." in `#pdf-form-error`. Otherwise call
  `createSongBookPdf(bookId, { includeChords, songIds? })`. On success call
  `goBackOr(pdfListPath)` and show "PDF created." Errors use the ported
  `getGeneratePdfErrorMessage`.
- Title: `New PDF · {book} · Śpiewnik SpoTkanie`.

#### 5.5.9 Share (`share`, Owner only)

- Non-owners: navigate with `replace` to the book and show "Only the owner can
  manage sharing."
- `<h1>` "Share". Intro: "Readers can view songs and download PDFs. Editors
  can also add, edit, and delete songs."
- `<form id="share-form">`: `#share-email` (`type="email"`, required, label
  "Email of a registered user", `autocomplete="off"`), `#share-access-level`
  (select, label "Access", options Reader and Editor, default Reader), submit
  `#share-submit` "Add", and `#share-form-error` (hidden when empty).
- `<ul id="collaborator-list">`. Each `<li data-access-id="{id}">` has the
  email, a select (`data-action="change-access"`, visually hidden label
  "Access for {email}"), and the button `data-action="remove-access"`
  "Remove" (accessible name "Remove {email}").
- Add: `setSongBookAccess(bookId, { email, accessLevel })`. Update the existing
  row or prepend a new one, clear and focus the email field, and show "Access
  saved." Errors (ported `getSongBookAccessErrorMessage`) go to
  `#share-form-error`.
- Change: send the same PUT with the row's email and the new level. On
  success show "Access updated."; on failure restore the previous value and
  show the error.
- Remove: confirm dialog with title "Remove access?", the message
  `Remove access for "{email}"?`, and the destructive confirm "Remove". Then
  `removeSongBookAccess`, remove the row, and show "Access removed."
- `#collaborator-list-state`: "Loading collaborators…", "Not shared with
  anyone yet.", or an error with "Try again". `#show-more-collaborators`
  "Show more" (accessible name "Show more collaborators").
- Title: `Share · {book} · Śpiewnik SpoTkanie`.

#### 5.5.10 Users (`users`, Moderator or SuperUser)

- Others: navigate with `replace` to `#/` and show "You don't have access to
  user management."
- `<h1>` "Users". `<ul id="user-list">`. Each `<li data-user-id="{id}">` shows
  the email (fallback "Account without email") and "{SuperUser, Moderator, or
  User} · {Banned, Active, or Unconfirmed}".
- A row menu (visible "⋯", accessible name "Actions for {email}",
  `data-action="user-menu"`) is rendered only when the target can be managed.
  Port the rules from the old `renderUserManagement` exactly:
  - The target can be managed when its role is not `superuser` and either
    the caller is `superuser` or the target's role is `user`.
  - The role item is shown only to the SuperUser, and only when the target is
    a moderator ("Remove moderator", `remove-moderator`) or an active,
    confirmed, unbanned user ("Make moderator", `grant-moderator`).
  - "Ban" (`ban-user`) or "Unban" (`unban-user`).
  - "Delete user" (`delete-user`, destructive).
- Confirm dialogs use the existing texts, with `{email}` from
  `displayValue(user.email, "this account")`. Unban has no confirmation.

  | Action | Message | Confirm label |
  | --- | --- | --- |
  | `grant-moderator` | `Allow {email} to ban and delete other users?` | Make moderator |
  | `remove-moderator` | `Remove Moderator access from {email}?` | Remove moderator |
  | `ban-user` | `Ban {email}? Their active sessions will end.` | Ban |
  | `delete-user` | `Permanently delete {email} and all of their song books and songs? This cannot be undone.` | Delete user |

- Success messages (existing): "Moderator access granted.", "Moderator access
  removed.", "Account banned.", "Account unbanned.", "Account and its song books
  deleted." After success, reload the list from page 1.
- 401 → session-ended flow. 403 → reload the session; if the user is no
  longer a moderator, navigate to `#/` with "You no longer have access to user
  management."
- `#user-list-state`: "Loading users…", "No other users.", or an error with
  "Try again". `#show-more-users` "Show more" (accessible name "Show more
  users").
- Title: `Users · Śpiewnik SpoTkanie`.

#### 5.5.11 Not found (`not-found`)

`<h1>` "Page not found", the text "This page doesn't exist.", and the link
`#not-found-home-link` "Go to your song books" to `#/`.

### 5.6 Shared UI components

#### 5.6.1 Dialog (`src/ui/dialog.js`)

Uses the static `<dialog id="app-dialog" aria-labelledby="dialog-title">`. Its
content is rebuilt on every open as
`<form id="dialog-form" method="dialog">` with `<h2 id="dialog-title">`,
`<p id="dialog-message">`, optional `<label for="dialog-input">` and
`<input id="dialog-input">`, `<p id="dialog-error" role="alert" hidden>`,
`#dialog-cancel` (`type="button"`), and `#dialog-confirm`
(`type="submit"`).

```js
confirmDialog({ title, message, confirmLabel, cancelLabel = "Cancel", destructive = false })
// -> Promise<boolean>

promptDialog({ title, label, value = "", maxLength, required = true, confirmLabel, submit })
// submit: async (trimmedValue) => errorMessage | null
// -> Promise<result | null>; null when cancelled
```

- `showModal()` opens it. Escape (the `cancel` event) and `#dialog-cancel`
  resolve as cancelled.
- Initial focus: destructive confirm → Cancel; other confirms → Confirm;
  prompt → the input with its text selected.
- The prompt keeps the dialog open while `submit` runs (buttons disabled).
  A returned message is shown in `#dialog-error`; `null` closes the dialog and
  resolves with the value.
- On close, focus returns to the element that opened the dialog if it is still
  in the document; otherwise to `#screen-heading`.
- Only one dialog can be open. Opening a second one throws. Navigation closes
  an open dialog as cancelled.

#### 5.6.2 Menu (`src/ui/menu.js`)

`createMenu({ label, accessibleName, items, id })` returns `{ root, close }`.
The root holds a `<button type="button" aria-expanded="false"
aria-controls="{id}">` and `<div id="{id}" class="menu__panel" hidden>`.
Items are `{ kind: "link", text, href }` or `{ kind: "button", text, action,
destructive, onSelect }`, rendered as native links or buttons. Activating
the button toggles the panel. The panel closes on item activation, Escape
(focus returns to the button), a click outside (body-level listener while
open), or navigation. Opening focuses the first item. Arrow-key roving is not
required.

#### 5.6.3 Status (`src/ui/status.js`)

The static `<div id="app-status" class="status" role="status"
aria-live="polite" aria-atomic="true">` holds `#app-status-message`, an
optional link `#app-status-action`, and `#app-status-dismiss` "Dismiss"
(errors only).

```js
status.show(type, message, { action: { text, href } } = {}) // type: "info" | "success" | "error"
status.clear()
```

- Errors set `role="alert"` and `aria-live="assertive"`. Other types restore
  `role="status"` and `aria-live="polite"`. This is the existing notice
  contract.
- Success and info messages clear themselves after 5 seconds unless replaced.
  Errors stay until dismissed, replaced, or the next navigation.
- The router clears the status before each render. `navigate(path, {
  status })` shows the given status after the new screen has rendered.
- Progress such as "Saving…" is never shown here; it appears on the busy
  control.

### 5.7 Message catalogue

Use these strings exactly; several are carried over from the old client, and
tests assert them.

| Situation | Text |
| --- | --- |
| Session ended | Your session ended. Sign in to access your song books. |
| Session ended with an unsaved draft | Your session ended. Sign in to retry; your unsaved song data was kept. |
| Signed in | Signed in. |
| Signed in, draft restored | Signed in. Your unsaved song draft was restored. |
| Signed out | Signed out. |
| Book lost (403/404) | That song book is no longer available to your account. |
| Song missing | This song no longer exists. It may have been deleted. |
| Song already deleted | This song was already deleted. |
| Mutation forbidden (403) | Your account is not allowed to make this change. |
| Mutation forbidden in the editor | Your account is not allowed to make this change. Your song data was kept. |
| Editor role required | You need Editor access to change songs in this book. |
| Owner required (PDF) | Only the owner can create PDFs. |
| Owner required (share) | Only the owner can manage sharing. |
| Moderation required | You don't have access to user management. |
| Moderation lost | You no longer have access to user management. |
| Book created, renamed, deleted | Song book created. / Song book renamed. / Song book deleted. |
| Song created, saved, deleted | Song created. / Song saved. / Song deleted. |
| PDF created | PDF created. |
| Access saved, updated, removed | Access saved. / Access updated. / Access removed. |
| Duplicate book name | You already have a song book with that name. Choose a different name. |
| Draft kept | Unsaved changes to "{title}" were kept. (action "Continue editing") |
| Draft restored in the editor | Restored your unsaved changes. |

Auth, network, 400, and 5xx texts come from the ported functions. Replace
any wording that refers to removed controls ("Try Refresh PDFs", "Use View to
try again", "Go to a previous page") with "Try again."

## 6. Server changes (Phase 1)

Both features are additive, need no migration, and keep the existing
canonical song order: SQL `ORDER BY Title, Id` with SQLite's default BINARY
collation (`EfSongRepository.GetPageAsync`; PDF export uses the same order).
**Never re-sort songs in .NET.** .NET compares `Guid` values differently from
SQLite's text ordering, so always reuse the SQL-ordered result.

Layering today: `SongBookApi.Domain` (DTOs, `Paging`, repository and service
interfaces, `SongService` in `Services/ISongService.cs`),
`SongBookApi.Infrastructure` (EF repositories), and `SongBookApi.Service`
(endpoints in `Endpoints/SongEndpoints.cs`, contracts in `Contracts/Song.cs`).

### 6.1 Song search

Contract: `GET /songbooks/{bookId}/songs?page=N&search=TEXT`

- `search` is optional. Trim it; an empty or whitespace value behaves exactly
  like today (the existing paged SQL query).
- More than 100 characters after trimming returns `400` with
  `Results.ValidationProblem` key `search` and the message "Search must
  contain at most 100 characters."
- Validate `page` and `search` before the access check, as `page` is
  validated today.
- Matching: fold the text by lower-casing (invariant), decomposing to
  FormD, removing `UnicodeCategory.NonSpacingMark` characters, mapping `ł` to
  `l`, and collapsing whitespace. Split the folded query on spaces into
  tokens. A song matches when every token is a substring (ordinal) of at
  least one folded field: title, original title, author, or number.
- The response shape, 50-item paging, `hasNext` lookahead, and order match the
  unfiltered list. Access is Reader, as for the list; no access returns `404`.
- Do not log the search text.

### 6.2 Adjacent songs

Contract: `GET /songbooks/{bookId}/songs/{songId}/adjacent` returns `200`:

```json
{
  "previous": { "id": "guid", "title": "Abide With Me", "author": null, "number": "3" },
  "next": null
}
```

- Each side is a song summary (same shape as list items) or `null` at the
  ends of the book.
- Reader access. Returns `404` when the book is inaccessible or the song is
  not in that book.

### 6.3 Implementation

1. `server/src/SongBookApi.Domain/Dto/SongIndexEntry.cs`:

   ```csharp
   public sealed record SongIndexEntry(
       Guid Id,
       string? Title,
       string? OriginalTitle,
       string? Author,
       string? Number);
   ```

2. `server/src/SongBookApi.Domain/Dto/AdjacentSongs.cs`:
   `public sealed record AdjacentSongs(SongSummary? Previous, SongSummary? Next);`
3. `server/src/SongBookApi.Domain/SongSearch.cs` (static, pure):
   `public const int MaxLength = 100;`,
   `public static string Fold(string? value)`,
   `public static IReadOnlyList<string> Tokenize(string? search)`, and
   `public static bool Matches(SongIndexEntry entry, IReadOnlyList<string> tokens)`
   (an empty token list matches everything).
4. `ISongRepository`: add
   `Task<IReadOnlyList<SongIndexEntry>> GetIndexAsync(Guid songBookId);`.
   `EfSongRepository` implements it with `AsNoTracking()`, the same `Where`,
   `OrderBy(song => song.Title)`, and `ThenBy(song => song.Id)` as
   `GetPageAsync`, followed by a `Select` into `SongIndexEntry` and
   `ToListAsync()`.
5. `ISongService` and `SongService`: add

   ```csharp
   Task<PageResult<SongSummary>> SearchSongsPageAsync(Guid songBookId, string search, int page);
   Task<AdjacentSongs?> GetAdjacentSongsAsync(Guid songBookId, Guid songId);
   ```

   Search: tokenize, filter the index in order, then apply
   `Skip(Paging.Offset(page))`, `Take(Paging.Size + 1)`, project to
   `SongSummary`, and return `Paging.FromLookahead(...)`. Adjacent: find the
   song's position in the index; return `null` if absent, otherwise its
   neighbors or `null` at either end.
6. `Contracts/Song.cs`: add
   `public sealed record AdjacentSongsResponse(SongSummaryResponse? Previous, SongSummaryResponse? Next);`.
7. `SongEndpoints.cs`: add a `string? search = null` parameter to `GetSongs`
   and branch to `SearchSongsPageAsync` when the trimmed value is not empty.
   Map `songs.MapGet("/{songId:guid}/adjacent", GetAdjacentSongs);` using
   `RequireAccessAsync(..., EffectiveSongBookAccess.Reader)`; a `null` result
   returns `Results.NotFound()`.
8. Update `RecordingSongRepository` in
   `server/tests/SongBookApi.Service.Tests/Unit/SongServiceTests.cs` so it
   still compiles (`GetIndexAsync` throws `NotSupportedException`).
9. Performance note for the README: search and adjacent lookups read the
   book's index columns once per request, which is fine for books with
   thousands of songs. A persisted folded column is a later option, not part
   of this work.

### 6.4 Server tests

Use the existing helpers `AuthenticationTestHelpers.CreateConfirmedClientAsync`,
`SongBookTestHelpers.CreateBookAsync`, and `SongBookTestHelpers.SetAccessAsync`.
Add `SongBookTestHelpers.CreateSongWithFieldsAsync(HttpClient client, Guid
bookId, object body)` for songs with author, number, and original title. All
paths below are under `server/tests/SongBookApi.Service.Tests/`.

- `Unit/SongSearchTests.cs`
  (`[Trait("Category", "Unit")]`): `Fold` ("Ślicznie Gwiazdeczko" →
  "slicznie gwiazdeczko", "ŁÓDŹ" → "lodz", null and whitespace → empty,
  repeated whitespace collapsed), `Tokenize`, and `Matches` (tokens split
  across fields, number, original title, no match, empty tokens).
- `Unit/SongServiceTests.cs`: search filters while preserving the
  repository's order (use an index that is not sorted by `Guid`), paging and
  `hasNext` with 51+ matches, and adjacent first, middle, last, single, and
  missing cases with an in-memory fake repository.
- `Functional/SongSearchFunctionalTests.cs`: diacritic ("slicznie" finds
  "Ślicznie Gwiazdeczko") and case insensitivity, author, number, original
  title, multi-word AND, a whitespace-only search equal to the unfiltered list,
  101 characters → 400 with the `search` key, 55 matches → page 2 has 5 items
  and `hasNext` false, result order equal to the filtered unfiltered order,
  another user's book → 404, and a Reader collaborator → 200.
- `Functional/AdjacentSongsFunctionalTests.cs`: neighbors equal the positions
  in the concatenated pages of the list (include duplicate titles to exercise
  the ID tie-break), nulls at both ends, a single-song book, an unknown song →
  404, a song from another book → 404, no access → 404, and a Reader → 200.

### 6.5 Server README

Update `server/README.md`: add the adjacent route to the "Nested song
contract" table, document `search` (fields, folding, AND semantics, the
100-character limit, the 400 error) next to the list route and in "Paged
collections", and state that list pages, adjacent lookups, and PDF exports
share one canonical order.

## 7. Client architecture

### 7.1 Files

```text
client/
  index.html              static shell (7.2)
  ui-redesign-plan.md     this plan
  styles/
    app.css               tokens, layout, app bar, screens, lists, song, editor, dialog, status
    buttons.css           button variants (kept)
  src/
    main.js               bootstrap only
    app.js                startApp(): creates context, installs listeners, starts router
    router.js             route table, matching, href(), navigate(), goBackOr(), rendering
    session.js            auth state, load, sign-out, session-ended flow
    drafts.js             in-memory editor drafts
    chordNotation.js      inline [Chord] parse/serialize
    songForm.js           editor model <-> song/payload (pure, recreated in Phase 5)
    chords.js             isChordAnchor, renderChordedText (kept)
    httpClient.js  pagination.js  songsApi.js  songBooksApi.js  authApi.js  moderationApi.js
    ui/
      dom.js              h(), findActionTarget(), isInDocument(), later()
      shell.js            app bar: breadcrumb, account menu, focus mode
      status.js           status region (5.6.3)
      dialog.js           confirmDialog(), promptDialog() (5.6.1)
      menu.js             createMenu() (5.6.2)
      pagedList.js        "Show more" lists (7.7)
      errors.js           ApiError -> user message (ported from main.js)
      format.js           displayValue, formatAccessLevel, song labels, counts, dates
      pdf.js              readPdfMetadata, pdfDownloadName, downloadPdfFile (ported)
    screens/
      authScreen.js  libraryScreen.js  bookScreen.js  songScreen.js
      songEditorScreen.js  pdfListScreen.js  pdfNewScreen.js
      shareScreen.js  usersScreen.js  notFoundScreen.js  systemScreens.js (loading, unavailable)
```

### 7.2 Shell and startup

`index.html` body (and nothing else):

```html
<header id="app-bar" class="app-bar">
    <a id="app-home-link" class="app-bar__brand" href="#/">Śpiewnik SpoTkanie</a>
    <nav id="app-breadcrumb" class="app-bar__breadcrumb" aria-label="Breadcrumb"></nav>
    <div id="account-menu" class="app-bar__account" hidden></div>
</header>
<main id="screen" class="screen"></main>
<div id="app-status" class="status" role="status" aria-live="polite" aria-atomic="true"></div>
<dialog id="app-dialog" class="dialog" aria-labelledby="dialog-title"></dialog>
<script type="module" src="src/main.js"></script>
```

Keep the existing `<head>` (charset, viewport, title, both stylesheets).

`main.js`:

```js
import { startApp } from "./app.js"

export const app = startApp()
export const initialization = app.ready
```

`startApp()` in `app.js`:

1. Look up the seven shell elements by ID; throw if any is missing.
2. `resetAntiforgeryToken()`.
3. Create the context: `{ elements, session, router, status, dialogs,
   drafts, cache: { bookList: null }, prefs: { showChords: true } }`.
4. Run the ported auth-query handling (5.5.1).
5. Listeners: `window` `hashchange` → `router.handleHashChange()`;
   `window` `beforeunload` → the editor's dirty guard; `document.body`
   `click` → internal link interception (7.3) and closing menus on outside
   clicks; `document.body` `keydown` → Escape for menus and the current
   view's `onKeydown`.
6. `history.scrollRestoration = "manual"`.
7. `ready = session.load().then(() => router.start())`.
8. Return `{ ready, navigate: router.navigate, context }` for tests.

### 7.3 Router (`router.js`)

```js
createRouter(ctx) -> {
  start(),                          // renders the current location (initial render, no focus move)
  navigate(path, { replace = false, status = null } = {}),  // Promise resolved after render
  goBackOr(path, { status = null } = {}),
  replaceQuery(query),              // replaceState only, no render (book search)
  handleHashChange(),               // Back/Forward/manual edits: render with traversal = true
  render({ traversal }),
  href(name, params = {}, query = {}),
  current                           // { route, params, query, view }
}
```

- `parseLocation(hash)`: strip `#`; an empty path is `/`; split off `?` into
  `URLSearchParams`.
- The route table is an ordered array of
  `{ name, segments: ["books", ":bookId", "songs", "new"], render, minimumAccess }`.
- `navigate()` calls `history.pushState(null, "", "#" + path)` (or
  `replaceState`), then awaits `render({ traversal: false })`, then shows
  `status`. pushState does not fire `hashchange`, so there is no double
  render.
- Link interception: the body `click` listener finds the nearest `<a>` with
  `getAttribute("href")` starting with `#/`. Unless a modifier key or
  non-primary button was used, it calls `preventDefault()` and awaits
  `navigate(href)`. Tests can therefore `await link.click()`.
- `goBackOr(path)`: the router keeps an in-memory list of entries it pushed
  (path and index). If the previous entry's path equals `path`, it calls
  `history.back()` and resolves after the resulting `hashchange` render;
  otherwise it calls `navigate(path, { replace: true })`. Example: book → song
  → edit → Save returns to the song and leaves the history as book → song.
- `handleHashChange()` updates the tracked index (back, forward, or a new
  manual entry) and awaits `render({ traversal: true })`.
- `render()`:
  1. `const renderId = ++renderCount`; abort the previous screen's
     `AbortController`; call the previous view's `cleanup()` (this is where
     the editor keeps a dirty draft and the book screen saves its snapshot).
     `cleanup()` may return a status (`{ type, message, action }`); remember
     it. Close any menu and dialog; clear the status.
  2. Pick the view: `loading`, `unavailable`, or `auth` from the session
     state; otherwise match the route or fall back to Not found.
  3. Set `main.dataset.screen`, `main.replaceChildren()`, and
     `aria-busy="true"`; set shell focus mode (`#app-bar.hidden`) for editor
     routes.
  4. Create the screen context (7.5) and `await screen.render(screenCtx)`.
  5. If `renderId` is still current: `aria-busy="false"`; scroll (restore the
     snapshot position or `scrollTo(0, 0)`); unless this is the first render,
     focus `view.focusTarget ?? #screen-heading`. Then show the status: an
     explicit one from `navigate()` or `session.ended()` wins over the one
     returned by `cleanup()`.
- Breadcrumbs and `document.title` are set by screens through
  `ctx.setBreadcrumb(items)` and `ctx.setTitle(parts)`.

### 7.4 Session (`session.js`)

- State: `{ status: "loading" | "authenticated" | "anonymous" | "unavailable",
  email, role, generation }`. Port the role validation from `loadAuthState`.
- `load()`: increment `generation`, call `getCurrentUser()`, then set the
  status. A 401 or `isAuthenticated: false` → `anonymous`; any other failure
  → `unavailable`.
- `ended()` (any 401 from a private request): increment `generation`, set
  `anonymous`, clear `cache`, keep drafts, `resetAntiforgeryToken()`, await
  `router.render()`, then show the session-ended message (the draft variant
  when the editor just kept a draft).
- `signOut()`: `logout()` (a 401 counts as already signed out), clear drafts
  and cache, `resetAntiforgeryToken()`, `load()`,
  `navigate("/", { replace: true, status: "Signed out." })`.
- Every asynchronous operation captures `session.generation` and
  `ctx.isCurrent()` before awaiting and checks both afterwards. When either
  changed, it must not touch the DOM or the context. Mutations started on a
  screen may still update caches and drafts.

### 7.5 Screen contract

```js
export async function renderBookScreen(ctx) {
    // 1. Build the skeleton synchronously into ctx.root (heading "Loading…").
    // 2. Load data with ctx.signal; after every await: if (!ctx.isCurrent()) return.
    // 3. Fill content; call ctx.setTitle([...]) and ctx.setBreadcrumb([...]).
    return { cleanup, focusTarget, onKeydown }  // all optional
}
```

The screen context extends the app context with `root` (`#screen`),
`params`, `query`, `signal` (aborted on leave), `traversal`, `isCurrent()`,
`setTitle()`, `setBreadcrumb()`, `navigate`, `goBackOr`, `href`, and
`handleError(error, scope)`.

- Pass `ctx.signal` to every GET. Do not pass it to mutations (they must
  finish), but still check `isCurrent()` before touching the DOM afterwards.
- Ignore errors whose `name` is `"AbortError"`.
- Load independent resources in parallel with `Promise.all` (book with songs;
  book, song, and adjacent; and so on).

### 7.6 Error handling (`ctx.handleError`, `ui/errors.js`)

| Situation | Behavior |
| --- | --- |
| Any request returns 401 | `session.ended()` |
| `GET /songbooks/{id}` returns 403 or 404 | Clear caches for the book; `navigate("/", { replace: true })`; error "That song book is no longer available to your account." |
| Song `GET` returns 404 | Re-check the book; if the book is fine, `navigate(bookPath, { replace: true })` with "This song no longer exists. It may have been deleted." |
| Adjacent request fails | Hide the pager; no message |
| Mutation returns 403 | Re-fetch the book and re-render the screen for the new role; show the 403 message (5.7) |
| Mutation returns 404 because the book is gone | As the book rule above |
| 400 | Ported message with safe API detail (`getSafeApiDetail`: at most 240 characters, no `<`/`>`, nothing that mentions "exception" or "stack trace") |
| 409 on book name | Inline dialog error (5.5.3) |
| Network failure (`status === null`) | Ported "Could not reach the SongBook API…" message; lists show "Try again" |
| 5xx | Ported server-error messages |
| Programmer error | `console.error(error)` (never with secrets) and a generic error status |

The API returns 404, not 403, for books the caller cannot see, and 403 for an
insufficient role.

### 7.7 "Show more" lists (`ui/pagedList.js`)

```js
createPagedList({
    list, stateElement, moreButton,      // <ul>, <p>, <button>
    fetchPage,                           // (page, signal) => Promise<{ items, page, hasNext }>
    renderItem, getKey,                  // item => <li>, item => id
    messages: { loading, empty, error }, // empty may be a function returning nodes
    signal
}) -> { reload(), loadMore(), items(), snapshot(), restore(snapshot) }
```

- Validate every response with `readPage(value, page)`.
- Append new rows; never rebuild existing rows. Skip items whose key is
  already rendered.
- Set `aria-busy` on the list while loading. Disable "Show more" while loading
  and hide it when `hasNext` is false.
- A first-page failure shows the error and a "Try again" button in the state
  element. A later-page failure keeps the rows and shows "Couldn't load more.
  Try again." next to the still-enabled button.
- `reload()` aborts any in-flight load (child `AbortController` linked to the
  screen signal) and starts again at page 1.
- `fetchAvailablePage` is not used, because appending never lands on an empty
  page.

### 7.8 Drafts (`drafts.js`)

```js
createDrafts() -> { owner, get(key), set(owner, key, draft), delete(key), clear() }
// key: `${bookId}/${songId ?? "new"}`; owner: lower-cased account email
// draft: { mode, bookId, songId, title, fields, parts: [{ id, name, notation }] }
```

- `set()` with a different owner clears all other drafts first.
- Saved when the editor is left while dirty (view `cleanup`) and before
  `session.ended()` re-renders.
- Restored only when the signed-in email equals the owner, the book still
  grants Editor access, and (for edit) the song still exists. Otherwise the
  draft is deleted.
- Deleted after a successful save, a confirmed Cancel, or "Discard them".
  Cleared on sign-out and when a different account signs in.
- Drafts are never written to storage.

### 7.9 Book list snapshot

- When the book screen is left, `cleanup` stores `ctx.cache.bookList = {
  bookId, q, items, page, hasNext, scrollY }`.
- When the book screen renders with `traversal: true` and a snapshot exists
  for the same `bookId` and `q`, render the rows from the snapshot (still
  fetch the book itself for the header and role), then scroll to `scrollY`.
  Otherwise load normally.
- Invalidate on song create, update, or delete in the book; on book rename or
  delete; on access loss; and on sign-out or session end.

### 7.10 Inline chord notation (`chordNotation.js`)

```js
parseChordNotation(notation) -> { text, chords: [{ offset, symbol }], errors: [{ line, message }] }
serializeChordNotation(text, chords) -> { notation, simplified }
```

Grammar (parse after converting `\r\n` and `\r` to `\n`):

- `\[` is a literal `[`, and `\\` is a literal `\`. Any other `\` is literal.
- `[symbol]` is a chord: the closing `]` must be on the same line. Trim the
  symbol, which must be 1-64 characters and must not contain `[`.
- Every other character, including a lone `]`, is lyrics. Iterate by code
  point so surrogate pairs stay together.

Anchoring algorithm:

```text
pending = null
for each token:
  chord    -> if pending: emit " " anchored to pending; pending = symbol
  "\n"     -> if pending: emit " " anchored to pending; emit "\n"; line++
  lyric ch -> if pending: chords.push({ offset: text.length, symbol: pending }); pending = null
              emit ch
end        -> if pending: emit " " anchored to pending
```

So a chord at the end of a line or text, or directly followed by another
chord, gets one inserted space as its anchor. This matches the API rule that
anchors cannot be line breaks.

Errors (each blocks saving):

| Case | Message |
| --- | --- |
| `[` without `]` on the same line | Missing "]" after "[". |
| Empty chord (`[]` or `[  ]`) | Empty chord "[]". |
| Symbol longer than 64 characters | Chord "{first 10 characters}…" is longer than 64 characters. |
| `[` inside a chord (`[A[B]`) | Unexpected "[" inside a chord. |

After an error, treat the offending `[` as a lyric character and continue, so
every error in the part is reported at once.

Serialization: walk `text` by UTF-16 index. Before the character at a chord's
offset, emit `[symbol]`. Escape a literal `[` as `\[`, and a `\` that is
followed by `[` or `\` as `\\`. Symbols containing `[`, `]`, or line breaks
cannot be represented: remove those characters (`?` if nothing remains) and
return `simplified: true`. The editor then shows "Some chord symbols
contained brackets and were simplified." in that part's error area, as a
warning that does not block saving.

Round trip: for any valid API part (anchors that are not line breaks, unique
offsets, symbols without brackets),
`parse(serialize(text, chords).notation)` returns exactly `text` and
`chords`.

Required test vectors (`tests/unit/chord-notation.test.mjs`):

| Notation | Text | Chords |
| --- | --- | --- |
| `[G]Amazing [D7]grace` | `Amazing grace` | G@0, D7@8 |
| `sound[A7]` | `sound ` | A7@5 |
| `[G][D]word` | ` word` | G@0, D@1 |
| `[G] [D] [Em]` | three spaces | G@0, D@1, Em@2 |
| `one[C]` then a newline, then `two` | `one \ntwo` | C@3 |
| `\[x] and \\` | `[x] and \` (both escapes resolved) | none |
| `[ Am ]x` | `x` | Am@0 |
| `[C]😀` | `😀` | C@0 (surrogate pair intact) |
| `[G` | error, line 1 | |
| `[]x` | error, line 1 | |

### 7.11 Editor model and payload (`songForm.js`, Phase 5)

```js
songToEditorModel(song) -> { fields, parts: [{ key, id, name, notation }], simplified }
createEmptyEditorModel() -> { fields, parts: [emptyPart()] }
editorModelToPayload(model) -> { payload } | { errors: [{ partKey, line, message }] }
```

- Fields: `title`, `author`, `originalTitle`, `number`, `key`, `tempo`.
  Trim; an empty string becomes `null` (as `normalizeText` does today).
  Title stays optional.
- Loading a part: normalize `\r\n` to `\n` and shift chord offsets as
  `createPartDraft` does today, then serialize to notation.
- Saving: skip parts whose name and notation are both blank (removing a
  part's content removes it). For each remaining part, parse the notation and
  send `{ id?, name, text, chords }`:
  - `name` uses `normalizeText`.
  - With chords, send `text` untrimmed so offsets stay valid. Without chords,
    use `normalizeText(text)`.
  - Always send a `chords` array (`[]` when there are none). Explicit arrays
    replace stored chords, so the server's "omitted chords" rule never applies.
  - Include `id` only for parts loaded from the server. Never send `key`.
- Part keys come from `crypto.randomUUID()`.

### 7.12 PDF download (`ui/pdf.js`)

Port `downloadPdf`, `readPdfMetadata`, and the current `pdfDownloadName(bookName,
pdf)` (filename `{book}-{chords|lyrics}-{id}.pdf`) unchanged:
validate the `Blob`, `URL.createObjectURL`, a temporary `<a download>`
appended, clicked, and removed, then `URL.revokeObjectURL` after one second.
Schedule the timer with `later()` from `ui/dom.js`, which calls `unref()` on
the timer when available so Node tests do not wait for it.

### 7.13 DOM conventions (`ui/dom.js`)

- `h(tagName, props, ...children)`: props `id`, `className`, `text`, `type`,
  `hidden`, `disabled`, `dataset`, `attrs` (applied with `setAttribute`), and
  `on` (event listeners). String children become text nodes; `null` and
  `false` are skipped; arrays are flattened.
- Set and read link targets only with `setAttribute("href")` and
  `getAttribute("href")`. The `href` property is absolute in browsers.
- Delegate list events: `findActionTarget(event.target, container)` walks
  `parentNode` up to the container and returns the first element with
  `dataset.action`. Do not use `querySelector`, `closest`, or CSS selectors;
  the fake DOM has no selector engine.
- Keep references to created elements instead of looking them up again.
  `document.getElementById` is fine for the static shell.
- Set ARIA with `setAttribute`. Use `classList` only for modifier classes.

### 7.14 CSS

Rewrite `styles/app.css` from scratch; keep `buttons.css` and adjust it.

- Tokens in `:root`: text `#172033`, muted `#475467`, border `#d7deea`,
  separator `#e5eaf1`, accent `#1d4ed8`, danger `#b42318`, success `#067647`,
  warning text `#7a271a`, focus `#1d4ed8`. Page background white; no panel
  boxes or shadows except for the menu, dialog, and status.
- Layout: `.screen { max-width: 46rem; margin-inline: auto; padding: 1rem; }`;
  `.screen-header` is a wrapping flex row of the `<h1>` and `.screen-actions`.
- App bar: sticky top, white, bottom border, brand bold; breadcrumb
  separators via `li + li::before { content: "›" }`; breadcrumb collapse
  below 40rem (5.4).
- `.row-list` and `.row-link`: full-width block links, minimum height
  2.75rem, separators, hover and focus styles, a trailing `›` via `::after`.
  `.song-row` is a grid of number (3rem), title, and author; hide the author
  below 32rem.
- Song: `.song-part__text { white-space: pre-wrap; font-size: 1.125rem;
  line-height: 1.6; }`. Keep the existing `.chorded-text`, `.chord-line`,
  and `.chord-cell` rules (monospace, horizontal scroll). `#song-pager` is a
  two-column row with a top border.
- Editor: sticky `.editor-bar`, monospace textarea, parts separated by space.
- `.menu`: relative wrapper; `.menu__panel` absolute, right-aligned, white,
  bordered, shadowed, minimum width 12rem, z-index 20.
- Dialog: maximum width 28rem; `::backdrop { background: rgb(15 23 42 / 40%); }`.
- Status: fixed at the bottom center, maximum width 40rem, left border colored
  by type, hidden when empty.
- `.visually-hidden` utility, `.badge`, and `.badge--warning`.
- Keep the 44×44 target size, `:focus-visible`, and reflow at 320px.

### 7.15 API module changes (Phase 2)

- `pagination.js`: `pageUrl(url, page, params = {})` builds the query with
  `URLSearchParams`: `page` first (only when greater than 1), then every
  non-empty param in insertion order. Existing outputs are unchanged.
- `songsApi.js`: `getSongs(songBookId, page = 1, { search, signal } = {})`
  (trims `search` and omits it when empty),
  `getSong(songBookId, songId, { signal })` (unchanged), and the new
  `getAdjacentSongs(songBookId, songId, { signal } = {})`.
- `songBooksApi.js`: optional `{ signal }` as the last argument of
  `getSongBooks`, `getSongBook`, `getSongBookAccess`, and `getSongBookPdfs`.
- `moderationApi.js`: optional `{ signal }` for `getManagedUsers`.

## 8. Behaviors that must survive the rewrite

Each row needs at least one new test (the file name is in the last column).

| Old behavior (old `main.js`) | New owner | Test file |
| --- | --- | --- |
| Request-ID counters and `authGeneration` guards: late responses never render or overwrite newer state | Screen `AbortController`, `isCurrent()`, `session.generation` | `integration/navigation-races` |
| Song detail aborts the previous request (`selectSong`) | Song screen signal | `integration/navigation-races` |
| Login, register, resend, forgot, and reset flows, with their validation and messages | `authScreen`, `session` | `integration/auth-screen` |
| `?auth=` link handling and URL sanitizing | `app.js` startup | `integration/auth-screen` |
| 401 anywhere → private data removed from the DOM, auth card shown, session-ended message | `session.ended()` | `integration/session-expiry` |
| `/auth/me` failure hides private data | Unavailable view | `integration/session-expiry` |
| Book 403/404 → back to the library with a message, caches cleared | `handleError` | `integration/book-screen` |
| Song 404 → book re-check, then the book or the library | `handleError` | `integration/song-screen` |
| Mutation 403 → role refreshed, data kept, message | Screens and `handleError` | `integration/song-editor`, `integration/book-screen` |
| Draft kept on 401 and restored only for the same account after access is revalidated | `drafts`, editor | `integration/session-expiry` |
| Late save after an account switch cannot affect the new session | Generation guard | `integration/session-expiry` |
| Book create, rename, delete, and the 409 conflict message | Library and book screens | `integration/library-screen`, `integration/book-screen` |
| Collaborator add, change, remove, and validation messages | `shareScreen` | `integration/share-screen` |
| Song create and update: part IDs and order preserved, no `clientKey` sent, duplicate submit prevented | Editor, `songForm` | `integration/song-editor`, `unit/song-form` |
| Save failure keeps every value and the part order | Editor | `integration/song-editor` |
| Delete confirmation, cancel, failure, and already-deleted handling | Song screen | `integration/song-screen` |
| PDF list, outdated flag, download (one at a time), owner-only creation, whole or selected songs | PDF screens, `ui/pdf.js` | `integration/pdf-screens` |
| Moderation permission rules, confirmations, messages, lost privileges, late responses after sign-out | `usersScreen` | `integration/users-screen` |
| Error messages: network, 400 with safe details, 5xx, safe-detail filtering | `ui/errors.js` | `unit/errors` |
| Notice semantics: alert role for errors, polite status otherwise | `ui/status.js` | `unit/ui-components` |
| Literal rendering of markup-like user text | All screens | `integration/song-screen`, `integration/library-screen` |
| Book detail and songs requested in parallel | Book screen | `integration/book-screen` |
| Chords render above lyrics and can be toggled | Song screen | `integration/song-screen` |
| Keyboard operability and focus after navigation, dialog close, and deletion | Router, dialog | `integration/shell`, `unit/ui-components` |

## 9. Testing

### 9.1 Principles

- Tests seed a fake API (9.3), start a fresh app, navigate, interact through
  the fake DOM, and assert visible DOM, status text, and API state. They do
  not assert private implementation state.
- Each test creates its own browser and app: call `installAppBrowser()` and
  then `startApp()` from `src/app.js` (which is possible because there is no
  module-level state).
- Find elements by the IDs in section 5, `data-*` hooks, and visible text.
- Make every user-visible action awaitable (`await link.click()`,
  `await form.submit()`); avoid sleeps. For debounce or auto-hide timers, use
  `t.mock.timers` from `node:test`, or submit the search form.

### 9.2 Fake browser (`tests/helpers/testBrowser.mjs`)

Phase 2 adds `installAppBrowser({ api, initialUrl = "https://localhost/" })`
next to the legacy `installTestBrowser`. New behaviors below apply only to
documents created by `installAppBrowser`, so legacy tests keep passing until
Phase 3 deletes them together with `installTestBrowser`.

- Shell: create exactly the seven elements from 7.2. Export their IDs as
  `APP_SHELL_IDS` for the HTML shell test.
- `getElementById`: fall back to a tree search, so dynamically created
  elements are found.
- `FakeElement`: `classList` (`add`, `remove`, `toggle`, `contains`, kept in
  sync with `className`), `isConnected`, `contains(node)`, and no-op
  `scrollIntoView()` and `select()`.
- Default actions in `click()` when not prevented:
  - Inside an `<a>` whose `href` attribute starts with `#`: push the history
    entry, update `location.hash`, and await `window` `hashchange`
    listeners.
  - A `type="submit"` button inside a form: await the form's `submit` event
    with `submitter`.
  - A checkbox toggles `checked`; a radio checks itself and unchecks radios
    with the same `name` in the form. Then dispatch `change`.
- Add `change(value)` for selects (set `value`, dispatch `change`) and
  `keydown(key, modifiers)` for keyboard tests.
- `<dialog>`: `open`, `returnValue`, `showModal()` (records `{ title,
  message }` in `browser.dialogs` and applies queued answers), `close(value)`
  (dispatches `close`), and Escape (dispatches `cancel`, then closes).
- `window`: `addEventListener`, `removeEventListener`, `dispatch`; a history
  entry stack with `pushState`, `replaceState`, `back()`, and `forward()`
  (traversal updates `location` and awaits `hashchange` listeners when the hash
  changes); `scrollTo()` and `scrollY`; `history.scrollRestoration`.
- `document.title` is a plain property.
- `fetch` delegates to `api.handle(request)`. Honor `signal`: reject with a
  `DOMException` named `AbortError` when the signal is or becomes aborted.
- Browser helpers: `navigate(hash)`, `back()`, `screen()` (returns
  `#screen.dataset.screen`), `text(id)`, `queueDialogAnswer(true | false |
  string)` (a string fills the prompt and confirms), `dialogs`, and
  `settle()` (awaits a few `setImmediate` turns).

### 9.3 Fake API (`tests/helpers/fakeApi.mjs`)

```js
const api = createFakeApi()
api.seed.account("owner@example.com", { password, role: "user" | "moderator" | "superuser", confirmed: true, banned: false })
const bookId = api.seed.book({ owner: "owner@example.com", name: "Sunday Service" })
api.seed.access(bookId, "reader@example.com", "reader")
const songId = api.seed.song(bookId, { title, author, number, originalTitle, key, tempo, parts })
api.seed.pdf(bookId, { includeChords, songIds, generatedAtUtc, isOutdated })
api.signIn("owner@example.com")      // sets the current session without a request
api.intercept(request => response | Promise<response> | undefined) // failures, delays, races
api.requests                          // [{ method, path, query, body, headers }]
```

- Implement every route the client uses, with the server's semantics: 401
  without a session on private routes; 404 for books without access; 403 for
  an insufficient role; 400 when an unsafe method lacks `X-CSRF-TOKEN` (title
  "Invalid antiforgery token."); 409 for duplicate book names per owner
  (case-insensitive); 50-item pages `{ items, page, hasNext }`; books ordered
  by name, then ID; songs by title (ordinal, `null` first), then ID.
- Search folding mirrors the server:
  `value.toLowerCase().normalize("NFD").replace(/\p{Mn}/gu, "").replace(/ł/g, "l")`,
  whitespace collapsed, every token required.
- Adjacent songs, PDF creation (metadata only), PDF download (a small
  `application/pdf` body), and all moderation routes with the role rules from
  the server README.
- `tests/unit/fake-api.test.mjs` covers these semantics so screen tests can
  rely on them.

### 9.4 Disposition of today's 55 test files

Phase 3 deletes every old UI test together with the old UI. The replacement
column says where each behavior must be covered again.

| Old file(s) | Action | Replacement (phase) |
| --- | --- | --- |
| `unit/auth-api`, `unit/http-client` | Keep unchanged | — |
| `unit/moderation-api`, `unit/song-books-api` | Keep; add `signal` pass-through tests | (2) |
| `unit/songs-api` | Update the export list; add search, adjacent, and `signal` tests | (2) |
| `unit/pagination` | Add `pageUrl` params tests; later remove tests of deleted functions | (2), (8) |
| `unit/client-security` | Rewrite: scan every `src/**/*.js` recursively; keep today's rules; add bans on `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, and `setAttribute("style"`; check that `index.html` has no inline script, style, or `on*=` attribute. In Phase 3, also ban `window.confirm` (the old `main.js` still uses it until then) | (2), (3) |
| `unit/chords` | Switch to `installAppBrowser`; delete the `adjustChordsForTextEdit` cases | (3), (5) |
| `unit/html-shell` | Rewrite for the new shell | `unit/html-shell` (3) |
| `unit/main-structure` | Delete | `integration/app-start` (3) |
| `unit/read-rendering` | Delete | `integration/song-screen` (4) |
| `unit/rendering-efficiency` | Delete | `unit/paged-list` (3) |
| `unit/song-form` | Delete (old DOM editor) | `unit/song-form` (5, new API) |
| `integration/auth-confirmation-query`, `integration/auth-query-reset`, `functional/auth-workflow` | Delete | `integration/auth-screen` (3) |
| `integration/auth-session-independence`, `integration/private-state-auth-check` | Delete | `integration/session-expiry` (3) |
| `integration/private-state-race`, `integration/selection-race` | Delete | `integration/navigation-races` (4) |
| `integration/auth-mutation-failures`, `integration/draft-account-isolation`, `integration/stale-song-mutation` | Delete | `integration/session-expiry` (5) |
| `integration/main-api-wiring`, `functional/app-shell` | Delete | `integration/app-start`, `integration/shell` (3) |
| `integration/notice-errors` | Delete | `unit/errors`, `unit/ui-components` (3) |
| `integration/pagination-workflow` | Delete | `unit/paged-list`, `integration/library-screen` (3); `integration/book-screen` (4) |
| `integration/song-book-workflow`, `integration/song-book-errors` | Delete | `integration/library-screen` (3), `integration/book-screen` (4), `integration/share-screen` (6) |
| `integration/song-book-detail-revocation`, `integration/song-book-permissions`, `integration/performance-network` | Delete | `integration/book-screen`, `integration/song-screen` (4) |
| `integration/delete-cancel`, `integration/delete-failure`, `integration/missing-song`, `functional/delete-workflow` | Delete | `integration/song-screen` (4) |
| `integration/create-save`, `integration/edit-save`, `integration/editor-modes`, `integration/save-failure`, `integration/song-book-edit-revocation`, `functional/editor-workflow` | Delete | `integration/song-editor` (5) |
| `integration/chord-workflow` | Delete (cursor tool removed) | `unit/chord-notation`, `integration/song-editor` (5) |
| `integration/song-book-pdfs` | Delete | `integration/pdf-screens` (6) |
| `integration/song-book-access-race` | Delete | `integration/share-screen` (6) |
| `integration/moderation-errors`, `integration/moderation-permissions`, `integration/moderation-state-race`, `functional/moderation-workflow` | Delete | `integration/users-screen` (7) |
| `functional/read-flow`, `functional/song-book-crud-workflow` | Delete | `functional/end-to-end` (8) |
| `functional/songs-api-crud` | Migrate to the fake API (same assertions) | (2) |
| `integration/delete-nonselected-busy`, `integration/selection-reconciliation`, `functional/sidebar-navigation` | Delete (concepts removed) | — |

### 9.5 New client tests and required cases

All paths are under `client/tests/`, with the `.test.mjs` suffix.

- `unit/router`: route matching order (`songs/new` before `songs/{id}`),
  decoding and malformed escapes, `href()` encoding, query parsing,
  `navigate` push and replace, `goBackOr` back versus replace, and
  `replaceQuery` without rendering.
- `unit/errors`: every status class (network, 400 with detail, 400 with an
  unsafe detail, 403, 404, 409, 5xx) for each ported message function.
- `unit/ui-components`: status roles and auto-hide (mock timers); confirm and
  prompt dialogs (resolve values, Escape, inline prompt error, focus return);
  menu open, close, and Escape.
- `unit/paged-list`: "Show more" appends without replacing existing row
  nodes, dedupes keys, handles first-page and later-page errors, aborts on
  `reload()`, and supports snapshot and restore.
- `unit/html-shell`: `index.html` contains exactly the shell IDs (equal to
  `APP_SHELL_IDS`), the status attributes, the module script, no `<h1>`, and
  no inline script or style.
- `integration/app-start`: loading view, then the auth screen when anonymous,
  the library when signed in, the unavailable view with "Try again" on
  failure, and the requested deep link rendered after sign-in.
- `integration/auth-screen`: every view, validation and messages, `?auth=`
  links with sanitized URLs, reset prefill, and sign-in re-rendering the
  requested route.
- `integration/shell`: breadcrumb per route, collapsed parent link, account
  menu (Manage users only for moderators), sign-out, document titles, focus on
  `#screen-heading` after navigation, Not found, and the app bar hidden on
  editor routes.
- `integration/session-expiry`: a 401 on any screen removes private DOM and
  shows the auth card with the session-ended message; in Phase 5, an editor
  save with 401 keeps the draft, the same account restores it, another
  account does not, and a late save after an account switch changes nothing.
- `integration/library-screen`: list, shared labels, empty state, "Show more",
  create book (dialog, 409 inline error, navigation to the new book), and
  literal rendering of markup-like names.
- `integration/book-screen`: role-based actions (Reader, Editor, Owner),
  parallel requests, search (submit, debounce with mock timers, `q` in the
  hash, no results, clearing), "Show more", rename and delete dialogs (cancel,
  409, success), 403/404 → library, and snapshot restore on Back.
- `integration/song-screen`: meta formatting and omissions, parts and
  chords, the chords toggle persisting across songs, pager links and arrow
  keys (ignored in inputs and with modifiers), replace history for
  previous/next, edit and delete visibility by role, delete (confirm,
  cancel, failure, already deleted), 404 handling, and literal text.
- `integration/navigation-races`: a late book, song, or list response after
  navigation is ignored; a late response after sign-out is ignored.
- `unit/chord-notation`: every vector in 7.10, every error message, round-trip
  checks over generated cases, and symbol simplification.
- `unit/song-form`: model from a song (CRLF offsets), payload rules from 7.11
  (IDs, blank parts, trimming, explicit chords, no keys).
- `unit/drafts`: owner isolation, key format, clear rules.
- `integration/song-editor`: create and edit happy paths with chords,
  notation errors blocking save, part add, move, and remove, More details
  disclosure, duplicate-submit prevention, save failure keeping values, 403 and
  404 on save, Cancel with and without changes, leaving while dirty keeping the
  draft with the "Continue editing" action, restore and "Discard them",
  `beforeunload` while dirty, and non-editors redirected.
- `integration/pdf-screens`: list formatting, outdated badge, download
  (blob, filename, one at a time, errors), owner-only "New PDF", whole-book
  and chosen-song creation with search and "Show more" selection persistence,
  and the empty-selection error.
- `integration/share-screen`: add, update, and remove (confirm), select
  revert on failure, validation messages, non-owner redirect, and navigation
  away during a save not corrupting the next screen.
- `integration/users-screen`: menu items per role and target (port the old
  permission matrix), each confirmation text, unban without confirmation,
  success messages, lost privileges, non-moderator redirect, and a late
  response after sign-out.
- `functional/end-to-end`: sign in, create a book, add a song with chords,
  view it, search, previous/next, share with a reader, create and download a
  PDF, sign in as the reader (read-only UI), and sign out.

## 10. Phases

Each phase ends with both suites green, the Progress table updated, and one
commit (or a few) containing only this phase's files.

### Phase 0: Baseline

- [ ] `git status`; apply section 1, step 1 (files this plan touches must be
      committed first; other unrelated changes are never committed).
- [ ] Create `feature/ui-redesign`.
- [ ] Run both suites; record the pass counts in Notes. Fix nothing unrelated.

### Phase 1: Server search and adjacent songs

- [ ] Implement section 6.3 (DTOs, `SongSearch`, repository, service,
      contract, endpoints, test fake update).
- [ ] Add the tests from 6.4.
- [ ] Update `server/README.md` (6.5).
- Acceptance: `dotnet test server/SongBookApi.slnx` passes. Run locally and
  check `GET /songbooks/{id}/songs?search=...` and
  `GET /songbooks/{id}/songs/{songId}/adjacent` against seeded data. The
  client suite is unchanged and still passes.

### Phase 2: Test infrastructure and API modules

- [ ] API module changes (7.15) with unit tests (9.4 rows for `songs-api`,
      `song-books-api`, `moderation-api`, `pagination`).
- [ ] `installAppBrowser` and the fake DOM extensions (9.2), without changing
      legacy behavior.
- [ ] `tests/helpers/fakeApi.mjs` with `unit/fake-api.test.mjs` (9.3).
- [ ] Rewrite `unit/client-security.test.mjs` (9.4).
- [ ] Migrate `functional/songs-api-crud.test.mjs` to the fake API.
- Acceptance: all existing UI tests still pass (the old UI is untouched),
  plus the new and updated tests.

### Phase 3: App shell, router, auth, library

- [ ] New `index.html` shell (7.2); keep `<head>`.
- [ ] `main.js` bootstrap, `app.js`, `router.js`, `session.js`, and the
      `ui/` modules `dom`, `shell`, `status`, `dialog`, `menu`, `pagedList`,
      `errors`, and `format`.
- [ ] Screens: `systemScreens` (loading, unavailable), `authScreen`,
      `libraryScreen`, `notFoundScreen`. Book and song routes render Not found
      until Phase 4.
- [ ] Base CSS: tokens, app bar, screen layout, row lists, dialog, menu,
      status, auth card.
- [ ] Delete the old UI: the old `main.js` body, `songForm.js`, every old UI
      test listed in 9.4, the legacy `installTestBrowser`, and old CSS
      selectors for removed panels. Migrate `unit/chords.test.mjs` to
      `installAppBrowser`.
- [ ] Add the `window.confirm` ban to `unit/client-security.test.mjs` (9.4).
- [ ] New tests: `unit/html-shell`, `unit/router`, `unit/errors`,
      `unit/ui-components`, `unit/paged-list`, `integration/app-start`,
      `integration/auth-screen`, `integration/shell`,
      `integration/session-expiry` (non-editor cases),
      `integration/library-screen`.
- Acceptance: in a real browser, sign in and out, run the reset and
  confirmation links, list and create books, use the account menu, and use
  Back/Forward across library and Not found. Keyboard-only use works.

### Phase 4: Book and song screens

- [ ] `bookScreen` (5.5.4): header, actions, owner menu with rename and
      delete, search with debounce and `q`, "Show more", snapshot restore
      (7.9).
- [ ] `songScreen` (5.5.5): meta, parts, chords toggle, pager, arrow keys,
      delete, 404 handling.
- [ ] `handleError` rules for books and songs (7.6).
- [ ] CSS for book rows, song typography, and the pager.
- [ ] Tests: `integration/book-screen`, `integration/song-screen`,
      `integration/navigation-races`.
- Acceptance: browse a book with more than 50 songs (Show more, then Back
  restores the position), search with Polish diacritics, step through songs
  with the pager and arrow keys, toggle chords, and rename or delete as
  owner. A reader sees no Add song, Edit, Delete, or `⋯`.

### Phase 5: Song editor with inline chords

- [ ] `chordNotation.js` (7.10), the new `songForm.js` (7.11), and
      `drafts.js` (7.8), with unit tests.
- [ ] `songEditorScreen` (5.5.6), including focus mode, dirty tracking,
      Cancel confirmation, draft keep and restore, `beforeunload`, and error
      handling.
- [ ] Session-ended flow with the draft variant message (7.4).
- [ ] Remove `adjustChordsForTextEdit` and its tests from `chords.js`.
- [ ] Tests: `unit/chord-notation`, `unit/song-form`, `unit/drafts`,
      `integration/song-editor`, and the editor cases in
      `integration/session-expiry`.
- Acceptance: create a song with chords and verify they render above the
  right syllables. Edit an existing song that was chorded with the old editor
  and verify the chords round-trip unchanged after saving without edits.
  Reorder and remove parts. Expire the session while editing (delete the
  cookie), sign in again, and get the draft back.

### Phase 6: PDF and share screens

- [ ] `ui/pdf.js` (ported helpers), `pdfListScreen`, and `pdfNewScreen`
      (5.5.7, 5.5.8).
- [ ] `shareScreen` (5.5.9).
- [ ] Tests: `integration/pdf-screens`, `integration/share-screen`.
- Acceptance: as owner, create whole-book and chosen-song PDFs, download
  them, and see the outdated badge after a song edit. Share with a second
  account as Reader, change it to Editor, and remove it. As that account,
  confirm what is visible at each step.

### Phase 7: User management screen

- [ ] `usersScreen` (5.5.10) and the account menu link.
- [ ] Test: `integration/users-screen`.
- Acceptance: as SuperUser and as Moderator, the menus show exactly the
  permitted actions, and confirmations and messages match 5.5.10.

### Phase 8: Polish, cleanup, documentation

- [ ] Delete dead code: `fetchAvailablePage` and `renderPageControls` if
      unused (and their tests), unused CSS, and leftover helpers.
- [ ] CSS pass at 320, 768, and 1280 px and 200 % zoom; check focus,
      contrast, and touch targets.
- [ ] `functional/end-to-end.test.mjs`.
- [ ] Documentation (section 11).
- [ ] Manual QA (section 12); fix findings.
- [ ] Mark every phase Done in Progress and summarize the deviations.

## 11. Documentation updates

- Root `README.md`: describe the screen-based UI (library, book with search,
  song with previous/next and the chords toggle, focus-mode editor with
  bracket chords, PDF and share screens, account menu). The test command is
  unchanged.
- `server/README.md`: section 6.5 (Phase 1).
- `client/docs/song-crud-learning-plan/14-current-status-and-todo.md`: add a
  status row for the redesign that links to this plan, and update the
  validation evidence (test counts).
- `docs/external-dependencies.md`: no new dependencies; update only if a
  statement there becomes false.
- This plan: mark phases Done and record deviations.

## 12. Definition of done and manual QA

Done when:

- Every phase is marked Done, and both suites pass from a clean checkout.
- Every row in section 8 has a passing test.
- `client/src/main.js` is a bootstrap; no old panel IDs (`song-books-panel`,
  `selected-song-book-panel`, `song-workspace-heading`, `refresh-*`,
  `*-pagination`) remain in `client/index.html`, `client/src/`,
  `client/styles/`, or `client/tests/`.
- The security test passes with the extended rules; no inline styles or
  scripts exist (CSP).
- Documentation is updated.

Manual QA in a real browser, with Owner, Editor, Reader, Moderator, and
SuperUser accounts in separate profiles:

- [ ] Keyboard-only: sign in, create a book, add a song with chords, search,
      step through songs with the pager and arrows, share, create a PDF, and
      sign out. Focus is always visible and lands on each screen heading.
- [ ] 320 px width and 200 % zoom: no horizontal page scrolling except inside
      chorded lyrics; the app bar collapses to the parent link.
- [ ] Back, Forward, and reload on every route; deep link to a song while
      signed out → sign in → the song.
- [ ] A screen reader announces status messages; error messages use the
      alert role; dialogs are announced with their titles.
- [ ] Revoke a collaborator while they view the book: their next action
      returns them to the library with the lost-book message.
- [ ] Network tab: no requests to removed routes, and GETs are aborted when
      navigating away quickly.
- [ ] CSP: no console violations.

## 13. Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| The rewrite drops a subtle behavior from the old `main.js` | Section 8 checklist with mandatory tests; the old file stays available through `git show` of the commit recorded in the Phase 3 notes. |
| The fake DOM diverges from real browsers | Use only the documented DOM subset (7.13); run the manual QA list each phase. |
| The fake API diverges from the server | `unit/fake-api` encodes the server semantics; `functional/end-to-end` runs the main flows. |
| Search is slow for very large books | Index reads are small; the README documents the limitation and the persisted-column option. |
| Chord notation surprises (brackets in lyrics, section headers pasted as `[Chorus]`) | Visible hint with the escape, clear line-numbered errors, and part names for sections. |
| Old chorded songs change after editing | The round-trip guarantee in 7.10, covered by tests and Phase 5 acceptance. |
| History edge cases with `goBackOr` | Covered by `unit/router`; the fallback always uses `replace` navigation. |

## Appendix A: Wireframes

Library:

```text
Śpiewnik SpoTkanie                                    dawid@… ▾
────────────────────────────────────────────────────────────────
Song books                                     [New song book]

Sunday Service                                                ›
42 songs
────────────────────────────────────────────────────────────────
Youth camp 2026                                               ›
18 songs · Shared with you (Editor)
────────────────────────────────────────────────────────────────
                          [Show more]
```

Book (owner):

```text
Śpiewnik SpoTkanie › Sunday Service                   dawid@… ▾
────────────────────────────────────────────────────────────────
Sunday Service                        [Add song]    PDF    ⋯
42 songs                                    ┌──────────────────┐
                                            │ Share            │
Search songs                                │ Rename           │
[Title, author or number                  ] │ Delete song book │
                                            └──────────────────┘
 1   Amazing Grace                     John Newton             ›
 2   Be Thou My Vision                                         ›
                          [Show more]
```

Song:

```text
Śpiewnik SpoTkanie › Sunday Service › Amazing Grace   dawid@… ▾
────────────────────────────────────────────────────────────────
Amazing Grace                           [Chords]   Edit    ⋯
John Newton · Key G · Moderate · No. 1

Verse 1
G             D7
Amazing grace, how sweet the sound
             G
That saved a wretch like me
────────────────────────────────────────────────────────────────
‹ Abide With Me                            Be Thou My Vision ›
```

Song editor (focus mode, no app bar):

```text
[Cancel]          Edit song · Sunday Service              [Save]
────────────────────────────────────────────────────────────────
Title
[Amazing Grace                                                 ]
[More details ▸]

Part 1                                                      [⋯]
Part name   [Verse 1                                          ]
Lyrics and chords
┌──────────────────────────────────────────────────────────────┐
│[G]Amazing [D7]grace, how sweet the sound                     │
│that saved a [G]wretch like me                                │
└──────────────────────────────────────────────────────────────┘
[Add part]
Put chords in square brackets right before the syllable: [Am]Amazing …
```

PDF exports and New PDF:

```text
Śpiewnik SpoTkanie › Sunday Service › PDF exports     dawid@… ▾
────────────────────────────────────────────────────────────────
PDF exports                                          [New PDF]

Entire book · with chords                           [Download]
Created 24.10.2026, 16:20
────────────────────────────────────────────────────────────────
3 selected songs · lyrics only                      [Download]
Amazing Grace, Be Thou My Vision, Christ Is Risen
Created 02.10.2026, 09:12  [Outdated] The book changed after…

New PDF
Songs   (•) Entire book   ( ) Choose songs
        [x] Include chords
        Search [          ]   [ ] 1 Amazing Grace   [x] 2 Be Thou…
        1 song selected
                                   Cancel        [Create PDF]
```

Share:

```text
Śpiewnik SpoTkanie › Sunday Service › Share           dawid@… ▾
────────────────────────────────────────────────────────────────
Share
Readers can view songs and download PDFs. Editors can also add,
edit, and delete songs.

Email of a registered user            Access
[                              ]      [Reader ▾]       [Add]

anna@example.com                      [Editor ▾]    [Remove]
piotr@example.com                     [Reader ▾]    [Remove]
```

Users:

```text
Śpiewnik SpoTkanie › Users                            dawid@… ▾
────────────────────────────────────────────────────────────────
Users
anna@example.com          User · Active                     [⋯]
bob@example.com           Moderator · Active                [⋯]
eve@example.com           User · Banned                     [⋯]
                          [Show more]
```
