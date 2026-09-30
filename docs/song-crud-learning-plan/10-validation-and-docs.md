# 10 - Validation and Documentation

## Goal

Prove that the full CRUD workflow works against the real API, then record the
few local setup facts a future developer needs to reproduce it.

Do not stop after a happy-path demo. Most CRUD bugs appear around empty
responses, missing records, browser restrictions, and failed requests.

This stage follows the mandatory
[testing and documentation policy](00-overall-plan.md#testing-and-documentation-policy).

## AI implementation specification

### Status and prerequisites

Points 01-12 are complete. The current automated suites, nested private API
contract, same-origin authentication, persistence, authorization matrices,
and real HTTPS restart workflow have been validated. Browser-only visual and
accessibility-tree inspection remains a manual local check because this CLI
environment has no browser executable.

### Files in scope

Inspect all tracked source files in both repositories. Modify only defects
directly revealed by the checks.

Expected documentation/test helpers:

```text
SongBookApi/src/SongBookApi.Service/SongBookApi.Service.http
SongBookApi/utils/simpleCurl.ps1
SongBookApi/README.md
SongBookClient/docs/song-crud-learning-plan/
```

Do not create `SongBookClient/README.md` automatically. The user intentionally
deferred it while the project is small. Create one only after a separate
request; keep setup facts accurate in these guides meanwhile.

### Validation commands

From the API repository:

```sh
dotnet build SongBookApi.slnx
dotnet list src/SongBookApi.Service/SongBookApi.Service.csproj \
  package --vulnerable --include-transitive
```

From the client repository:

```sh
node --check src/main.js
node --check src/httpClient.js
node --check src/authApi.js
node --check src/songBooksApi.js
node --check src/songsApi.js
node --check src/songForm.js
rg 'innerHTML|no-cors' index.html src
rg '"order"[[:space:]]*:' index.html src
rg "fetch\\(" src --glob "*.js"
```

Expected search results:

- No `innerHTML`, `no-cors`, or serialized `order`.
- Every raw `fetch(` occurrence is in `src/httpClient.js`.

The current API restore reports high-severity warnings for transitive
`Microsoft.OpenApi` and `SQLitePCLRaw.lib.e_sqlite3` packages. They do not
block local workflow verification by themselves, but both must be resolved or
explicitly risk-accepted with an upgrade plan before point 13 can claim
production readiness.

### Runtime setup

Start the API:

```sh
dotnet run \
  --project src/SongBookApi.Service/SongBookApi.Service.csproj \
  --launch-profile https
```

Use a clean browser tab at `https://localhost:7152/` with the Network and
Console panels open. The API serves the client from the same origin in
Development; do not start lite-server. Use a dedicated test account/book or a
temporary database when a clean scenario is needed.

### Required CRUD acceptance dataset

Inside one private song book, create at least these records:

1. A song with every scalar field and two multi-line parts.
2. A song with optional scalar fields left blank and no parts.
3. A song with non-ASCII title/lyrics to confirm text handling.

For each mutation, inspect method, URL, request JSON, status, and follow-up
server state.

### Required happy-path matrix

| Scenario | Required result |
| --- | --- |
| Initial load | `GET /songbooks`, then nested songs only after book selection |
| Refresh | New scoped collection request; no duplicate concurrent request |
| View | `GET /songbooks/{bookId}/songs/{songId}` and correct current detail |
| Create | Nested `POST`, `201`, returned ID selected after refresh |
| Edit scalar fields | Nested `PUT`, `204`, changed values visible after refetch |
| Add/edit/reorder/remove parts | IDs preserved for existing parts; array order persisted |
| Cancel create/edit | No mutation request |
| Cancel delete | No DELETE request |
| Confirm delete | Nested `DELETE`, `204`, row/detail removed after refresh |

### Required failure matrix

| Scenario | Required result |
| --- | --- |
| API stopped during list load | Previous list retained when available; reachable-error notice |
| API stopped during save | Draft preserved and controls restored |
| API stopped during delete | Song remains visible |
| Individual `404` | Selection cleared and collection refreshed |
| Update `404` | Draft preserved; user told record disappeared |
| Delete `404` | UI converges to removed state |
| Rapid A/B selection | Late A response cannot replace B |
| Double Save | One mutation request |
| Double Delete | One mutation request |
| API restart | Accounts, books, access, songs, parts, and part order persist |

### API contract regression checks

Repeat point 02's two-song conflicting-ID scenario and part-ID round-trip
scenario. Also confirm:

- Create/update JSON contains no `order`.
- Create JSON contains no song ID.
- Update identity comes from the URL.
- New parts omit IDs and receive IDs after refetch.
- Existing part IDs remain stable.
- `204` responses are not parsed as JSON.

### Browser and accessibility checks

- Complete CRUD with keyboard only.
- Test 200 percent zoom.
- Test narrow and wide viewports.
- Confirm no horizontal page scrolling at 320 CSS pixels.
- Confirm notices are announced by the browser accessibility tree/live-region
  inspection.
- Confirm focus returns to a useful location after cancel, save, and delete.
- Confirm song/lyric strings are displayed literally rather than interpreted
  as HTML.

Use a harmless test title such as:

```text
<strong>Not markup</strong>
```

It must appear as literal text.

### Fix policy

When a check fails:

1. Identify the smallest root cause.
2. Change only files responsible for that behavior.
3. Rerun the targeted scenario.
4. Rerun the full static checks and happy-path CRUD matrix.
5. Do not hide a failure with a fallback that looks successful.

### Acceptance criteria

- [x] API build succeeds.
- [x] Vulnerability scan result is recorded for point 13.
- [x] All static architecture searches match expectations.
- [x] Every happy-path and failure scenario passes.
- [x] Console has no uncaught exceptions during automated tested flows.
- [x] Runtime HTTP traces show the exact five endpoint patterns.
- [x] Part IDs and array ordering round-trip correctly.
- [x] Automated keyboard/focus and responsive-layout checks pass.
- [x] No client README or dependency was added.

### Validation record - 2026-07-27

API results:

- `dotnet build SongBookApi.slnx`: succeeded for all four projects.
- `dotnet test SongBookApi.slnx --no-build`: 13 passed, 0 failed.
- The vulnerability scan reported transitive `Microsoft.OpenApi` `2.0.0`,
  severity High, advisory
  `https://github.com/advisories/GHSA-v5pm-xwqc-g5wc`.
- The running HTTPS service allowed only the configured localhost client
  origins and returned successful preflights for `POST`, `PUT`, and `DELETE`.
- A three-song dataset covered all scalar fields, blank optional fields, two
  multi-line parts, non-ASCII text, and literal `<strong>Not markup</strong>`
  content.
- Real requests verified `201` create, `200` list/detail, `204` update/delete,
  stale `404`, route-authoritative update identity, stable existing part IDs,
  server-generated new part IDs, persisted array order, and empty `204`
  response bodies.

Client results:

- All syntax and architecture searches matched the expected boundaries.
- The only raw `fetch(` call is in `src/songsApi.js`.
- Unit: 13 passed; integration: 12 passed; functional: 5 passed.
- The real `songsApi.js` adapter completed create, list, detail, update, and
  delete against `https://localhost:7152`.
- Automated failure coverage verifies network, `404`, `5xx`, rapid selection,
  duplicate Save/Delete suppression, draft preservation, focus restoration,
  live-region roles, and literal text rendering.

Environment notes:

- Port 7152 and port 3000 already had healthy processes running from the two
  repositories, so validation reused them rather than terminating user
  processes.
- The local developer certificate was accepted only by explicit insecure
  command-line test flags. A normal browser must trust it before manual use.
- PowerShell and a browser executable were unavailable. The PowerShell helper
  was inspected, and equivalent real HTTP checks passed through Node/curl.
  The manual zoom, accessibility-tree, Network-panel, and rendered 320-pixel
  checks remain in the browser checklist below.

### Current validation record - 2026-08-31

- API: 24 tests passed across authentication, authorization, contracts,
  persistence, cascades, constraints, and functional nested CRUD.
- Client: 54 tests passed across unit, integration, and functional layers.
- Raw `fetch` appears only in `src/httpClient.js`; client source contains no
  hard-coded localhost API origin, browser auth storage, unscoped song URL, or
  serialized `order` field.
- A temporary real HTTPS database accepted an authenticated book and nested
  song creation flow. After an API restart, the same session could retrieve
  the persisted book, song, part identity, and part text.
- Migrations list Identity followed by `AddSongBooks`.
- The vulnerability scan reports the two high-severity transitive advisories
  recorded in point 13.
- Browser-only zoom, rendered responsive layout, accessibility-tree, and
  screen-reader announcement inspection remain manual checks.

### Non-goals

- Do not add a test framework solely for this stage.
- Do not implement production database, auth, deployment, or monitoring.
- Do not redesign working UI while fixing validation defects.

## Pre-flight checklist

Before testing the UI:

- [ ] The API starts on the documented HTTPS URL.
- [ ] The browser trusts the local HTTPS certificate.
- [ ] The client is served by the API at the same HTTPS origin, not `file://`
      or lite-server.
- [ ] No CORS response is required for the same-origin workflow.
- [ ] The browser Network panel shows relative `/auth` and `/songbooks`
      requests.
- [ ] The point-02 route/part identity and point-12 nested authorization
      contracts are active.

## Manual CRUD acceptance script

Run this sequence in a fresh browser session:

1. Load the page, sign in, and confirm `GET /songbooks` loads only accessible
   private books.
2. Create or select a song book and confirm its nested song collection loads.
3. If the list is empty, confirm the empty state explains how an Editor/Admin
   can create a song.
4. Create a song with all supported scalar fields.
5. Confirm the request is `POST /songbooks/{bookId}/songs`, has JSON content,
   and receives `201 Created`.
6. Confirm the new song appears in the selected book with the API-returned ID.
7. Select it and confirm a nested detail request loads its data.
8. Change at least two fields and save.
9. Confirm the nested `PUT` uses the intended book/song route IDs,
   contains no song ID in the payload, and handles the `204` response without
   JSON parsing errors.
10. Reload the data from the API and confirm the changed values remain.
11. Delete the song.
12. Cancel once and confirm no network request occurs.
13. Confirm once and verify the nested `DELETE` returns `204`.
14. Confirm the row and selected detail are removed after refresh.

Repeat the create, view, edit, and delete sequence for parts after the API's
round-trip identity contract is complete. Confirm array ordering.

## Failure cases to test

| Scenario | Expected behavior |
| --- | --- |
| API process is stopped | User sees a useful connection error; no fake success state appears. |
| API returns `500` | User sees an action-specific failure and can retry. |
| Selected song is deleted elsewhere | Detail load handles `404`, clears selection, and refreshes list. |
| Delete target was already removed | UI reports the state and refreshes rather than crashing. |
| Double-click Save | Only one request is sent while saving is busy. |
| Rapidly choose two songs | A late response cannot overwrite the newer selection. |
| API restarts | UI reloads persisted books, permissions, songs, and parts. |
| Narrow browser viewport | List and editor remain readable and reachable. |
| Keyboard-only navigation | All actions, form controls, and cancellation are usable. |

Use the Network panel for every test. Inspect:

```text
Request URL
Request method
Request headers
Request payload
Response status
Response body, when applicable
```

This turns tests into an HTTP learning exercise instead of a visual guess.

## API-level smoke testing

The API repository contains `utils/simpleCurl.ps1`, which exercises the
authenticated song-book and nested-song endpoints. Update its example account
and payload values when the contract changes, then use it to distinguish
backend behavior from frontend behavior.

The service also has a `.http` file. It is a useful place to keep a concise
manual endpoint collection if your editor supports HTTP request files.

Test backend behavior first when a browser request is surprising:

```text
curl/API request succeeds, browser fails -> inspect CORS, certificate, or UI.
curl/API request fails too -> inspect API implementation and contract.
```

Remember that curl's `-k` can ignore a local certificate problem, while a
browser does not. A successful curl request is not proof that browser HTTPS is
configured correctly.

## Alternatives

### Manual browser testing

Manual testing is the right first step for this small vanilla application. It
lets you learn the browser Network panel, CORS behavior, form interaction, and
accessibility without adding a test tool.

- Good for: the first end-to-end CRUD implementation.
- Trade-off: repeated regressions require a person to execute the checklist.

### Native Node tests for pure functions

After the behavior is stable, make logic easier to test by extracting pure
functions such as:

```text
buildSongPayload(formValues, parts)
validateSongPayload(payload)
isLatestSelection(requestedId, selectedId)
```

If Node.js is already available, its built-in `node:test` runner can test such
pure functions without adding a package. Keep DOM integration tests manual
until there is a real need for a browser test tool.

- Good for: payload creation and validation rules.
- Trade-off: it does not test browser DOM behavior or real CORS requests.

### Browser end-to-end tests

Later, a browser automation tool can drive the complete CRUD acceptance
script.

- Good for: protecting an application with many repeatable flows.
- Trade-off: it adds dependencies, test data setup, and maintenance.

Do not add a test framework just to satisfy a checklist. Add one when the
project has enough repeated regression risk to justify its setup and
maintenance.

## Documentation to update

Keep these numbered guides synchronized with the final implementation,
especially URLs, file names, API body shape, and validation commands. A root
README remains optional and requires a separate user decision.

## Final review questions

Before calling the work complete, answer these without looking at code:

- Why do client API modules use relative URLs instead of an API base URL?
- Which module performs raw `fetch` calls?
- What happens when the API returns `204`?
- What happens when a selected private book becomes inaccessible?
- Why are both book and song route IDs authoritative?
- How are part IDs and array order preserved?
- Why is CORS unnecessary for the Development application flow?
- How does Reader/Editor/Admin access change the visible controls?
- How does a keyboard user manage books, collaborators, and songs?

If any answer is unclear, improve the code or documentation until it is
obvious.

## Resources

- [MDN: Network requests in browser developer tools](https://developer.mozilla.org/en-US/docs/Learn_web_development/Howto/Tools_and_setup/What_are_browser_developer_tools)
- [MDN: HTTP overview](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Overview)
- [Microsoft: ASP.NET Core integration testing](https://learn.microsoft.com/aspnet/core/test/integration-tests)
- [Node.js: Test runner](https://nodejs.org/api/test.html)

## Checkpoint

The automated work is complete when the nested CRUD, authentication,
authorization, persistence, and failure matrices pass. Final local acceptance
also requires the normal-browser script, truthful failure states, and guides
that accurately state the same-origin, certificate, permission, and durable
data assumptions.
