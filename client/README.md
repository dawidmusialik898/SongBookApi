# SongBook client

Vanilla JavaScript ES modules served by the API from the same origin. There
is no framework, bundler, npm package or `package.json`. Run the app and the
tests with the commands in the [root README](../README.md).

## Constraints

- **No dependencies.** `index.html` loads `styles/app.css`,
  `styles/buttons.css` and `<script type="module" src="src/main.js">`. Keep
  these entry paths: server tests request them and `deploy/publish.sh`
  packages only `index.html`, `src/` and `styles/`.
- **CSP** (`script-src 'self'; style-src 'self'`): no inline `<script>` or
  `<style>`, `style` attributes, `setAttribute("style", ...)` or `on*=`
  attributes, and no external fonts or images. Style only through stylesheet
  classes.
- **Security rules** (`tests/unit/client-security.test.mjs`): no
  `localStorage`/`sessionStorage`, no hard-coded origins, `fetch(` only in
  `src/httpClient.js`, never log passwords, codes or tokens. Render user
  content with `textContent`/text nodes; never `innerHTML`, `outerHTML`,
  `insertAdjacentHTML` or `document.write`.
- **No module-level mutable state** and no `window`/`document` access at
  import time. All state lives in objects created by `startApp()` so each test
  can start a fresh app. The only exception is the antiforgery-token cache in
  `httpClient.js`, which `startApp()` resets.
- **Accessible native controls.** Links (`<a href="#/...">`) navigate; buttons
  always have an explicit `type` and act. Every input has a visible label, one
  `<h1>` per screen, no positive `tabindex`, 44×44 px targets, visible
  `:focus-visible`, usable at 320 px and 200 % zoom.
- **Style.** 4-space indentation, no semicolons, double quotes, `function`
  declarations, named exports, early returns. Aim for modules under about
  400 lines.

## Layout

```text
index.html          static shell: #app-bar, #screen, #app-status, #app-dialog
styles/             app.css (tokens, layout, screens), buttons.css
src/
  main.js           bootstrap: startApp()
  app.js            creates the app context, handles ?auth= links, starts the router
  routes.js         route table, parseLocation(), buildHref()
  router.js         navigate(), goBackOr(), history tracking, rendering
  session.js        auth state, sign-out, session-ended flow
  errorHandler.js   ctx.handleError(): 401/403/404 handling per screen
  drafts.js         in-memory editor drafts (per account, never stored)
  chordNotation.js  inline [Chord] notation parse/serialize
  chords.js         chord anchors and chorded-text rendering
  songForm.js       editor model <-> song payload
  historyCompare.js revision comparison model
  httpClient.js     the only fetch() call; antiforgery token and ApiError
  pagination.js     page URL and page-shape validation
  *Api.js           auth, song books, songs, share links, moderation
  ui/               dom helpers (h()), shell, status, dialog, menu,
                    pagedList ("Show more"), errors, format, pdf, forms
  screens/          one module per screen (see routes.js)
```

Routes are hash-based (`#/books/{bookId}/songs/{songId}` and so on); see
`src/routes.js` for the full table and each route's minimum access. Public
`#/shared/books/{bookId}/{token}` routes render read-only screens without a
session (see [read-only links](../docs/read-only-share-links.md)).

## Screen contract

A screen is `async function render(ctx)` that builds its skeleton into
`ctx.root`, loads data, and may return `{ cleanup, focusTarget, onKeydown }`.

- Pass `ctx.signal` to every GET; ignore `AbortError`. Do not pass it to
  mutations, but check `ctx.isCurrent()` (and `session.generation`) after
  every `await` before touching the DOM.
- Report failures through `ctx.handleError(error, scope)`: any 401 ends the
  session (drafts are kept), a lost book returns to the library, a missing song
  returns to its book, and a 403 mutation refreshes the role.
- Use `h()` from `ui/dom.js`, `setAttribute`/`getAttribute("href")` for link
  targets, and `findActionTarget()` for delegated events. Do not use
  `querySelector` or `closest`: the test DOM has no selector engine.
- Lists use `createPagedList()` (50-item pages with "Show more").

## Song editor notation

Each part is edited as one textarea with inline chords: `[G]Amazing [D7]grace`.
`\[` is a literal `[`, `\\` a literal `\`. A chord at the end of a line or
directly followed by another chord is anchored to one inserted space, because
the API forbids line-break anchors. The editor always sends an explicit
`chords` array, so the server's "omitted chords" rule never applies. Parsing
and serialization round-trip for any valid API part; see
`tests/unit/chord-notation.test.mjs` for the reference vectors.

## Tests

```sh
node --test client/tests/unit/*.test.mjs \
  client/tests/integration/*.test.mjs \
  client/tests/functional/*.test.mjs
```

Tests use only Node built-ins and run against a hand-rolled fake DOM
(`tests/helpers/testBrowser.mjs`, no jsdom) and fake API
(`tests/helpers/fakeApi.mjs`), which mirrors the server's authorization,
antiforgery, paging, ordering and search semantics.

- Create a fresh `createFakeApi()` and `installAppBrowser({ api })` (or
  `createAppHarness(api)`) per test; seed data with `api.seed.*`.
- Interact through the fake DOM and assert visible DOM, status text and API
  state, not private implementation state. User actions are awaitable
  (`await link.click()`); avoid sleeps and use `t.mock.timers` for timers.
- Any new browser API the client uses (events, history, dialog and so on)
  must be emulated in `testBrowser.mjs`, and new server routes added to
  `fakeApi.mjs` with tests in `tests/unit/fake-api.test.mjs`.
