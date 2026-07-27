# 10 - Validation and Documentation

## Goal

Prove that the full CRUD workflow works against the real API, then record the
few local setup facts a future developer needs to reproduce it.

Do not stop after a happy-path demo. Most CRUD bugs appear around empty
responses, missing records, browser restrictions, and failed requests.

## AI implementation specification

### Status and prerequisites

Run this stage only after points 01-09 are complete. It is a verification and
small-fix stage, not an opportunity for a broad refactor.

### Files in scope

Inspect all tracked source files in both repositories. Modify only defects
directly revealed by the checks.

Expected documentation/test helpers:

```text
SongBookApi/src/SongBookApi.Service/SongBookApi.Service.http
SongBookApi/utils/simpleCurl.ps1
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
node --check src/songsApi.js
node --check src/songForm.js
rg 'innerHTML|no-cors' index.html src
rg '"order"[[:space:]]*:' index.html src
rg "fetch\\(" src --glob "*.js"
```

Expected search results:

- No `innerHTML`, `no-cors`, or serialized `order`.
- Every raw `fetch(` occurrence is in `src/songsApi.js`.

The baseline API branch was observed producing a vulnerability warning for a
transitive `Microsoft.OpenApi` package. Record the current result. It does not
block local CRUD verification by itself, but it must be resolved before point
13 can claim production readiness.

### Runtime setup

Start the API:

```sh
dotnet run \
  --project src/SongBookApi.Service/SongBookApi.Service.csproj \
  --launch-profile https
```

Start the client from its repository:

```sh
lite-server
```

Use a clean browser tab at `http://localhost:3000` with the Network and Console
panels open. Clear existing in-memory songs by restarting the API when a clean
scenario is needed.

### Required CRUD acceptance dataset

Create at least these records:

1. A song with every scalar field and two multi-line parts.
2. A song with optional scalar fields left blank and no parts.
3. A song with non-ASCII title/lyrics to confirm text handling.

For each mutation, inspect method, URL, request JSON, status, and follow-up
server state.

### Required happy-path matrix

| Scenario | Required result |
| --- | --- |
| Initial load | One `GET /songs`; loading then collection/empty state |
| Refresh | New `GET /songs`; no duplicate concurrent request |
| View | `GET /songs/{id}` and correct current detail |
| Create | `POST /songs`, `201`, returned ID selected after refresh |
| Edit scalar fields | `PUT /songs/{id}`, `204`, changed values visible after refetch |
| Add/edit/reorder/remove parts | IDs preserved for existing parts; array order persisted |
| Cancel create/edit | No mutation request |
| Cancel delete | No DELETE request |
| Confirm delete | `DELETE /songs/{id}`, `204`, row/detail removed after refresh |

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
| API restart | Client recovers; empty in-memory behavior is explained |

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

- [ ] API build succeeds.
- [ ] Vulnerability scan result is recorded for point 13.
- [ ] All static architecture searches match expectations.
- [ ] Every happy-path and failure scenario passes.
- [ ] Console has no uncaught exceptions during tested flows.
- [ ] Network panel shows the exact five endpoint patterns.
- [ ] Part IDs and array ordering round-trip correctly.
- [ ] Keyboard, focus, and narrow-layout checks pass.
- [ ] No README or dependency is added without user approval.

### Non-goals

- Do not add a test framework solely for this stage.
- Do not implement production database, auth, deployment, or monitoring.
- Do not redesign working UI while fixing validation defects.

## Pre-flight checklist

Before testing the UI:

- [ ] The API starts on the documented HTTPS URL.
- [ ] The browser trusts the local HTTPS certificate.
- [ ] The client is served from the documented HTTP origin, not `file://`.
- [ ] The API CORS policy allows exactly that client origin.
- [ ] The browser Network panel shows requests going to the intended API URL.
- [ ] The API contract changes from document 02 are complete, or the UI
      intentionally limits itself to scalar fields.

## Manual CRUD acceptance script

Run this sequence in a fresh browser session:

1. Load the page and confirm the initial list request is `GET /songs`.
2. If the list is empty, confirm the empty state explains how to create a song.
3. Create a song with all supported scalar fields.
4. Confirm the request is `POST /songs`, has JSON content, and receives
   `201 Created`.
5. Confirm the new song appears in the list with the API-returned ID.
6. Select it and confirm a `GET /songs/{id}` request loads its details.
7. Change at least two fields and save.
8. Confirm the request is `PUT /songs/{id}`, uses the intended route ID,
   contains no song ID in the payload, and handles the `204` response without
   JSON parsing errors.
9. Reload the data from the API and confirm the changed values remain.
10. Delete the song.
11. Cancel once and confirm no network request occurs.
12. Confirm once and verify `DELETE /songs/{id}` returns `204`.
13. Confirm the row and selected detail are removed after refresh.

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
| API restarts | UI can reload, and documentation explains that in-memory songs reset. |
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

The API repository contains `utils/simpleCurl.ps1`, which already sketches
requests for the song endpoints. Update its example IDs and payload shapes
when the API contract changes, then use it to distinguish backend behavior
from frontend behavior.

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

- Where is the single API base URL defined?
- Which module performs raw `fetch` calls?
- What happens when the API returns `204`?
- What happens when `GET /songs/{id}` returns `404`?
- Why is the route ID authoritative for `PUT`?
- How are part IDs and array order preserved?
- What browser origin is allowed by CORS?
- How does a keyboard user create, save, cancel, and delete a song?

If any answer is unclear, improve the code or documentation until it is
obvious.

## Resources

- [MDN: Network requests in browser developer tools](https://developer.mozilla.org/en-US/docs/Learn_web_development/Howto/Tools_and_setup/What_are_browser_developer_tools)
- [MDN: HTTP overview](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Overview)
- [Microsoft: ASP.NET Core integration testing](https://learn.microsoft.com/aspnet/core/test/integration-tests)
- [Node.js: Test runner](https://nodejs.org/api/test.html)

## Checkpoint

The work is complete when the acceptance script passes in a normal browser,
failure states are truthful, and these guides accurately state the CORS,
certificate, and in-memory-data assumptions.
