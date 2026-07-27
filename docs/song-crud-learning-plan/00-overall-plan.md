# Song CRUD Client Learning Plan

## Purpose

This guide is a step-by-step learning path for turning the existing vanilla
JavaScript client into a complete user interface for the SongBook API. It does
not require React, a package manager, or a UI library.

Work through the numbered files in order. Each file has a small, independently
useful outcome, so you can commit and test one stage before starting the next.

## Branch baseline

This plan was prepared against these checked-out branches:

| Repository | Branch | Baseline commit |
| --- | --- | --- |
| `SongBookApi` | `feature/copilot-experimentation` | `b6224bf3a28f1547bc423539c798a3ee83d6bed4` |
| `SongBookClient` | `feature/copilot-experimentation` | `9616df5d770ac3b3b574ec75827a4d99dbfa66be` |

Before an AI model implements a stage, it must inspect the current worktree and
compare it with this baseline. It must preserve newer user changes and adapt
the instructions when a referenced file has changed. The plan is authoritative
about desired behavior, not permission to overwrite unrelated work.

The local toolchain observed while preparing the plan is:

```text
.NET SDK 10.0.110
Node.js 22.14.0
globally installed lite-server 2.6.1
```

The client deliberately has no package manifest or external runtime
dependencies. Do not add a framework, bundler, npm dependency, or
`package.json` during points 01-10 unless the user explicitly approves it.

## What exists today

The client currently has:

- `index.html`, which contains only an empty song list.
- `src/main.js`, which loads the collection and creates a hard-coded
  "Imagine" song.
- `src/songsApi.js`, which implements only collection `GET` and `POST`.
- `styles/buttons.css`, which styles the temporary buttons.

The API already maps these endpoints:

| User capability | HTTP request | Successful response | Client use |
| --- | --- | --- | --- |
| List songs | `GET /songs` | `200` with `Song[]` | Initial list and refresh |
| View one song | `GET /songs/{id}` | `200` with `Song` | Detail/editor loading |
| Create a song | `POST /songs` | `201` with `Song` | New-song form |
| Edit a song | `PUT /songs/{id}` | `204 No Content` | Existing-song form |
| Delete a song | `DELETE /songs/{id}` | `204 No Content` | Delete action |

This table describes the baseline API used by points 01-11. Point 12 replaces
the unscoped song paths with authenticated
`/songbooks/{bookId}/songs/...` routes.

The API's default development addresses are `http://localhost:5068` and
`https://localhost:7152`. The client currently targets the HTTPS address.

The current development client is served by `lite-server` at
`http://localhost:3000`. The API CORS policy already permits that origin and
`http://127.0.0.1:3000`.

## Target result

When this plan is complete, a visitor can:

1. Open the client from a local web server.
2. See a loading state followed by the song list.
3. Open a specific song and inspect its complete data.
4. Create a song using a form instead of hard-coded JavaScript values.
5. Edit an existing song and save it.
6. Delete a song only after confirming the action.
7. Receive understandable feedback for loading, success, validation, and API
   errors.
8. Register, confirm an email address, log in, recover a password, and log out.
9. Create private named song books and store each song in exactly one book.
10. Share a song book with registered Reader or Editor collaborators.
11. Administer only books the user created and respect permission changes
    immediately.

The client remains a small set of browser-native ES modules:

```text
index.html
styles/
  buttons.css
  app.css                 # Add when the UI needs layout and form styles.
src/
  main.js                 # Page state, orchestration, and general rendering.
  httpClient.js           # Added in point 11; owns raw fetch and antiforgery.
  songsApi.js             # Song endpoint wrappers.
  authApi.js              # Added in point 11 for account/session endpoints.
  songBooksApi.js         # Added in point 12 for books and access management.
  songForm.js             # Added in point 07 for form and parts behavior.
```

Do not add a framework merely to render a list or submit a form. The DOM,
`fetch`, `FormData`, and CSS are enough for this application.

The final cleanup removes the unused experiments:

```text
src/factory.js
src/factories.js
src/modules/songList.html
```

Do not remove `src/factory.js` before `main.js` stops importing it.

## AI execution contract

Every implementation stage must follow this workflow:

1. Read the stage document and every file listed in its **Files in scope**
   section.
2. Check both repositories with `git status --short`; do not revert user
   changes.
3. Confirm prerequisite stages are complete. If a blocking API or product
   decision is unresolved, stop and ask rather than inventing behavior.
4. Implement only the stage scope and tightly coupled fixes.
5. Keep the application usable at the end of the stage; do not leave controls
   that silently do nothing.
6. Run the stage validation commands and perform its browser acceptance checks.
7. Report changed files, behavior delivered, and any unresolved limitation.

Cross-stage engineering rules:

- Keep raw `fetch` calls inside `src/songsApi.js` through point 10. Point 11
  moves them into shared `src/httpClient.js`; no other module may call raw
  `fetch`.
- Use `textContent` or text nodes for all song data; do not render user data
  with `innerHTML`.
- Treat the API as the source of truth and refresh after successful mutations.
- Treat `204 No Content` as success without parsing JSON.
- Throw request failures from the API module; UI code decides how to display
  them.
- Do not use `mode: "no-cors"`, broad silent catches, optimistic mutations,
  or hidden form fields as the authoritative selected song ID.
- Preserve nullable API fields. Until the API adds validation, blank scalar
  form values become `null` and `title` remains optional.
- The `parts` array is the canonical part order on this branch. There is no
  `Song.order` property.
- After point 12, every persisted song also has one server-owned song-book ID;
  the client takes that identity from the nested route, not from request JSON.
- Prefer native HTML controls and browser APIs over custom widgets or packages.

## Stage dependencies

```text
01 local integration (complete)
  -> 02 API contract safety
      -> 03 client structure
          -> 04 Fetch API layer
              -> 05 HTML app shell
                  -> 06 read flows
                      -> 07 create/edit
                          -> 08 delete
                              -> 09 UX/accessibility
                                  -> 10 validation
                                      -> 11 authentication/authorization
                                          -> 12 song-book repositories/sharing
                                              -> 13 production readiness decisions
```

Points 03 and 04 may be implemented in one change set, but their acceptance
criteria must still be checked separately. Point 13 is blocked on deployment,
database provider, email provider, recovery, monitoring, and availability
decisions and must not be implemented by guessing.

## Recommended order

- [x] Verify [01 - Local API integration](01-local-api-integration.md).
- [ ] Resolve the backend contract issues in
      [02 - API contract safety](02-api-contract-safety.md).
- [ ] Set up the client boundaries in
      [03 - Client structure](03-client-structure.md).
- [ ] Make all HTTP calls reliable in
      [04 - Fetch API layer](04-fetch-api-layer.md).
- [ ] Replace the temporary page with the semantic shell in
      [05 - HTML app shell](05-html-app-shell.md).
- [ ] Build list and detail behavior in
      [06 - Read flows](06-read-flows.md).
- [ ] Build the shared editor in
      [07 - Create and edit](07-create-and-edit.md).
- [ ] Add the destructive action safely in
      [08 - Delete flow](08-delete-flow.md).
- [ ] Improve feedback and accessibility in
      [09 - UX and accessibility](09-ux-accessibility.md).
- [ ] Run the acceptance checks and document local setup in
      [10 - Validation and documentation](10-validation-and-docs.md).
- [ ] Add same-origin cookie authentication and protect write operations in
      [11 - Authentication and authorization](11-authentication-and-authorization.md).
- [ ] Add private song books, ownership, and collaborator permissions in
      [12 - Song-book repositories and sharing](12-song-book-repositories-and-sharing.md).
- [ ] Plan the deployment and security changes in
      [13 - Production readiness](13-production-readiness.md).

## Important API facts to keep in mind

`Song` has scalar properties (`title`, `author`, `originalTitle`, `number`,
`key`, and `tempo`) plus a `parts` array. Array position is the current display
order; this branch has no separate `order` property.

The current API has two issues that matter to a client:

1. The update service receives the route ID but currently ignores it and
   updates by the generated or submitted `id` inside the request body.
2. `Part.Id` is read-only and generated in the server constructor. As a
   result, existing part IDs cannot be reliably preserved by an editor.

Point 02 resolves both issues before the form editor is built. After that
point, the route ID is authoritative for `PUT`, existing part IDs round-trip,
and the client omits song IDs from create/update payload bodies.

Also, the repository is in memory. A server restart intentionally clears all
songs. Treat that as a development limitation, not a frontend bug.

## Learning principles for this project

- Make one small vertical slice work before expanding it. For example, get
  list loading reliable before adding editing.
- Use the browser Network panel to see the exact request URL, method, body,
  status code, and response.
- Keep the API layer separate from DOM code. A function that calls `fetch`
  should not create HTML elements.
- Keep server data as the source of truth. After mutations, refresh from the
  API rather than guessing the final state locally.
- Render user-provided text with `textContent`, never by inserting it as HTML.
- Prefer simple controls first: an edit side panel and `window.confirm()` are
  easier to make correct than a custom modal or drag-and-drop UI.

## Small glossary

| Term | Meaning in this project |
| --- | --- |
| Origin | The combination of scheme, host, and port, such as `http://localhost:3000`. |
| CORS | Browser rules that decide whether one origin may call another origin's API. |
| API adapter | The `songsApi.js` module that converts HTTP requests and responses into JavaScript values. |
| State | The current data needed to render the page, such as songs, selection, and loading flags. |
| CRUD | Create, Read, Update, and Delete. |
| `204 No Content` | A successful response with no JSON body. Calling `response.json()` on it is an error. |

## Definition of done

The project is complete when all five endpoint rows in the table above are
reachable from the UI, failures do not leave the page in a misleading state,
all point-10 acceptance scenarios pass, and the implementation still uses only
browser-native client dependencies. Production deployment is a separate
milestone governed by point 13.
