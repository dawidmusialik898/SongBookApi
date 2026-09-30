# 05 - HTML App Shell

## Goal

Replace the temporary buttons and empty list with a semantic, accessible page
structure that gives every later JavaScript feature a stable place to render.

Build the shell before filling it with network data. A clear HTML structure
makes JavaScript simpler because each renderer has an obvious target.

This stage follows the mandatory
[testing and documentation policy](00-overall-plan.md#testing-and-documentation-policy).

## AI implementation specification

### Status and prerequisites

This stage is complete. Points 03 and 04 pass, and the result remains a plain
static site served by lite-server.

### Files in scope

Modify:

```text
SongBookClient/index.html
SongBookClient/src/main.js
SongBookClient/styles/buttons.css
SongBookClient/tests/helpers/testBrowser.mjs
SongBookClient/tests/unit/main-structure.test.mjs
SongBookClient/tests/integration/main-api-wiring.test.mjs
SongBookClient/docs/song-crud-learning-plan/05-html-app-shell.md
```

Add:

```text
SongBookClient/styles/app.css
SongBookClient/tests/unit/html-shell.test.mjs
SongBookClient/tests/functional/app-shell.test.mjs
```

Deleted after references were removed:

```text
SongBookClient/src/factory.js
SongBookClient/src/factories.js
SongBookClient/src/modules/songList.html
SongBookClient/tests/functional/temporary-controls.test.mjs
```

### Required HTML contract

`index.html` must contain these stable elements:

| ID | Element/purpose |
| --- | --- |
| `new-song-button` | Hidden toolbar button, enabled in point 07 |
| `refresh-songs-button` | Collection refresh button |
| `app-status` | Persistent `role="status"` live region |
| `song-list-state` | Loading/empty-list text |
| `song-list` | `<ul>` populated by JavaScript |
| `song-details` | Read-only selected-song region |
| `song-form` | Hidden form wired in point 07 |
| `song-form-heading` | Create/edit form heading |
| `song-title` | Input with `name="title"` |
| `song-author` | Input with `name="author"` |
| `song-original-title` | Input with `name="originalTitle"` |
| `song-number` | Input with `name="number"` |
| `song-key` | Input with `name="key"` |
| `song-tempo` | Input with `name="tempo"` |
| `parts-editor` | Container for part fieldsets |
| `add-part-button` | Add-part control inside the hidden form |
| `cancel-song-button` | Non-submit cancel control |
| `save-song-button` | Form submit control |

Use `hidden` on `new-song-button` and `song-form` until point 07 wires them.
Hidden controls are preferable to visible controls that do nothing.

The structural outline must be:

```text
header
  h1
  toolbar
status
main.app-layout
  section: song collection
  section: details/editor workspace
```

Keep the module script as:

```html
<script type="module" src="src/main.js"></script>
```

### Required JavaScript changes

1. Remove `btnFactory` and all dynamic top-level button creation.
2. Cache the static DOM elements once in an `elements` object.
3. Attach the refresh listener to `refresh-songs-button`.
4. Keep initial collection loading through `initialize()`.
5. Render the current basic song list into `song-list`; point 06 replaces it
   with interactive rows.
6. Show collection loading/empty text in `song-list-state`.
7. Route request failures to `state.notice` and render them in `app-status`.
8. Keep the create toolbar button and form hidden rather than partially
   implementing create behavior.
9. After imports are gone, delete the three unused experiment files.

### Required CSS behavior

`app.css` must provide:

- A readable page width and spacing scale.
- A single-column layout by default.
- A two-column list/workspace layout at a reasonable wider breakpoint.
- Form control sizing that does not overflow narrow screens.
- Visible `.notice--error`, `.notice--success`, and selected-row hooks for
  later stages.

`buttons.css` should contain reusable button classes rather than one
688-pixel-wide `.divbuttons` rule. Define neutral, primary, and destructive
variants, even if the destructive variant is not used until point 08.

Do not attempt a final visual design. Prioritize semantic structure and
readability.

### Acceptance criteria

- [x] The page has one visible `<h1>` and one `<main>`.
- [x] Every form control has an associated label or native button text.
- [x] Non-submit form buttons use `type="button"`.
- [x] All required IDs exist exactly once.
- [x] Refresh and initial list loading still work.
- [x] Request failures appear in the status region.
- [x] No visible control silently does nothing.
- [x] No script imports the deleted factory files.
- [x] The layout avoids fixed widths and horizontal overflow at 320 CSS
      pixels.
- [x] User data is rendered with text nodes, not `innerHTML`.
- [x] Unit, integration, and functional tests cover the shell behavior.
- [x] The HTML, CSS, and test commands are documented.

### Validation

```sh
node --check src/main.js
node --check src/songsApi.js
rg "factory|factories|songList\\.html|innerHTML" index.html src
node --test tests/unit/*.test.mjs
node --test tests/integration/*.test.mjs
node --test tests/functional/*.test.mjs
```

The unit layer verifies the state/loading renderer, every required ID, heading
and form semantics, responsive CSS hooks, notices, selected rows, and button
variants. The integration layer verifies startup and Refresh adapter wiring
plus stale-list error feedback. The functional layer verifies empty,
populated, refreshed, and hidden-editor shell behavior.

The search must find no obsolete import/reference and no user-data
`innerHTML` rendering. Inspect the page at narrow and wide browser widths and
tab through all visible controls.

### Non-goals

- Do not implement individual song loading, edit/save, parts behavior, or
  deletion.
- Do not add a modal, router, template library, or CSS framework.
- Do not enable the New song control until point 07.

## Recommended page layout

Use one `<main>` element with distinct regions:

```text
header
  page title
  New song button
  Refresh button

status region

main content
  song collection section
    heading
    list or empty state
  selected song / editor section
    heading
    detail summary
    form
```

On a narrow screen, stack the list and editor. On a wider screen, use CSS grid
or flexbox to place them side by side.

## Semantic HTML choices

| Need | Recommended element | Why |
| --- | --- | --- |
| Main page content | `<main>` | Identifies the primary content for assistive technology. |
| Song collection | `<section>` with a heading | Groups related content with a meaningful label. |
| Songs | `<ul>` with `<li>` rows | A song collection is naturally a list. |
| Actions | `<button type="button">` | It has keyboard behavior by default. |
| Editor | `<form>` | It provides submit behavior and browser validation. |
| Text fields | `<label>` plus `<input>` or `<textarea>` | Labels make controls understandable and clickable. |
| Feedback | `<p role="status">` or a live region | Announces async updates without stealing focus. |

Give JavaScript-owned containers stable IDs, for example:

```text
app-status
song-list
song-list-state
song-details
song-form
```

An ID is a contract between HTML and `main.js`. Choose names based on purpose,
not current visual styling.

## Build the shell in steps

1. Keep the existing module script at the end of `<body>`.
2. Add a visible `<h1>` so the page has a clear purpose.
3. Add a toolbar with "New song" and "Refresh songs" buttons.
4. Add a status container near the top of the content.
5. Add an initially empty song list container.
6. Add a hidden or empty editor section with a heading.
7. Add the form fields only after the list/detail regions are stable.
8. Ensure every button inside a form that is not the save button has
   `type="button"`; otherwise it can accidentally submit the form.

Start with ordinary HTML in `index.html`. Do not create the whole page with
JavaScript; static structure is easier to inspect in browser developer tools.

## Status and error regions

Use two types of feedback deliberately:

- `role="status"` or `aria-live="polite"` for normal events such as "Songs
  loaded" or "Saving song...".
- `role="alert"` only for important errors that should be announced promptly.

Do not replace a user's focused form field with a status message. Put feedback
in a stable area and update its text.

## CSS plan

The existing `styles/buttons.css` can continue to style shared buttons. Add
`styles/app.css` for application layout, form controls, list rows, selected
state, notices, and responsive rules. Link both files from `index.html`.

Useful class names are based on role:

```text
app-layout
toolbar
song-list
song-list__item
song-list__item--selected
notice
notice--error
editor
```

Avoid class names such as `red-text` or `big-div`; they describe current
appearance rather than purpose and become misleading when styles change.

## Form preview

Before wiring JavaScript, manually tab through the future form. A good
starting order is:

```text
Title -> Author -> Original title -> Number -> Key -> Tempo ->
part controls -> Cancel -> Save
```

Use a `<textarea>` for song text because lyrics can contain line breaks. Use
standard text inputs for fields whose domain has not yet been formally limited
by the API.

## Alternatives

### Editor in a side panel

Keep the list visible while editing.

- Good for: comparing the selected song with the collection.
- Trade-off: requires responsive layout rules for narrow screens.

This is the recommended first implementation.

### Editor in a modal dialog

Use the native `<dialog>` element to put editing above the list.

- Good for: focusing attention on one edit.
- Trade-off: focus management, escape behavior, and close behavior need more
  care.

Use this after the ordinary panel works, not as the first UI experiment.

### Separate create and edit pages

Use different HTML pages or hash routes.

- Good for: a larger site with shareable URLs.
- Trade-off: more navigation and state code than this small client needs.

## Resources

- [MDN: HTML forms](https://developer.mozilla.org/en-US/docs/Learn_web_development/Extensions/Forms)
- [MDN: `<label>`](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/label)
- [MDN: `<button>`](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/button)
- [MDN: `<main>`](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/main)
- [MDN: ARIA live regions](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Guides/Live_regions)
- [MDN: CSS grid layout](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Grid_layout)

## Checkpoint

You are ready to add rendering when the static page is understandable without
JavaScript: it has a title, appropriately labelled regions, buttons with clear
purposes, and a form with labels that can be navigated by keyboard.
