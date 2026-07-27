# 09 - UX and Accessibility

## Goal

Make asynchronous CRUD behavior understandable and usable with a keyboard,
screen reader, mouse, or touch device. Good feedback is not decoration: it
prevents a user from thinking a failed request succeeded.

## AI implementation specification

### Status and prerequisites

This is a hardening stage after points 05-08 are functionally complete. Do not
use it to redesign the CRUD architecture.

### Files in scope

Modify as required:

```text
SongBookClient/index.html
SongBookClient/src/main.js
SongBookClient/src/songForm.js
SongBookClient/styles/app.css
SongBookClient/styles/buttons.css
```

Do not change API contracts in this stage.

### Notice contract

Use the existing `state.notice` shape:

```js
{ type: "info" | "success" | "error", message: string }
```

Implement one `setNotice(type, message)` function and one `renderNotice()`
function. `renderNotice()` must:

- Put text in the persistent `app-status` region.
- Apply exactly one modifier class matching the notice type.
- Clear old type classes before applying a new one.
- Use `role="status"` / `aria-live="polite"` for routine information and
  success.
- Use `role="alert"` only while displaying an error, then restore the normal
  status role when the error is replaced.

Map technical failures at the UI boundary:

| Error | User message requirement |
| --- | --- |
| `ApiError.status === null` | Explain that the API could not be reached and can be retried. |
| `400` | Explain that submitted data was rejected; include safe API detail when available. |
| `404` | Explain that the selected/deleted song no longer exists. |
| `500` or other 5xx | Explain that the server could not complete the action. |
| Unexpected programmer error | Show a generic failure and log the technical error to the console. |

Do not show stack traces or raw HTML from an error response.

### Busy-state contract

Use existing state fields rather than adding overlapping flags:

```text
isLoadingSongs
isLoadingSong
isSaving
deletingSongId
```

Reflect them in the DOM:

- Apply `aria-busy="true"` to the list region while loading the collection.
- Apply `aria-busy="true"` to details while loading one song.
- Disable Refresh only while collection loading.
- Disable form mutation controls only while saving or when the selected song
  itself is being deleted.
- Disable only target Delete controls during deletion.
- Restore every state in `finally`, including error paths.

### Keyboard and focus contract

- `New song` focuses `song-title`.
- Edit focuses `song-title` after values are populated.
- Add part focuses the new part-name input.
- Browser validation focuses the first invalid control.
- Successful create/update focuses the selected song heading or View control
  after refreshed data loads.
- Successful deletion follows point 08's focus rule.
- Cancel returns focus to the control that opened the form when it still
  exists; otherwise it focuses the list heading.
- Every action uses a native `<button>`.
- DOM order and visual order must remain consistent.

Do not add positive `tabindex` values.

### Semantic and form contract

- Keep one `<h1>` and a logical descending heading hierarchy.
- Every input/textarea has a visible label.
- Each part is a `<fieldset>` with a `<legend>`.
- Associate any inline error with its field through `aria-describedby`.
- Give icon-free text labels to Move up, Move down, Remove, Edit, and Delete.
- Use `aria-current="true"` for the selected song control.
- Do not add ARIA roles that duplicate native element semantics.

### CSS requirements

Add or verify:

- A visible `:focus-visible` outline with sufficient contrast.
- Text/background contrast suitable for normal reading.
- Selected state communicated with shape/border/text in addition to color.
- Destructive buttons visually distinct from primary actions.
- Minimum practical touch target around 44 by 44 CSS pixels where layout
  permits.
- Form inputs use `max-width: 100%` and do not overflow.
- Lyrics preserve line breaks and wrap long text.
- At 320 CSS pixels, controls remain reachable without horizontal page
  scrolling.
- At wide widths, list and workspace remain readable rather than stretching
  without limit.

### Acceptance criteria

- [ ] Every async operation has visible pending, success, and failure feedback.
- [ ] No failed request produces success-shaped UI.
- [ ] The complete CRUD flow works using only keyboard input.
- [ ] Focus is not lost to the document body after form close or deletion.
- [ ] A selected song is recognizable without color.
- [ ] All form and part controls have understandable accessible names.
- [ ] User content is rendered as text.
- [ ] Narrow and wide layouts remain usable.

### Validation

Static checks:

```sh
node --check src/main.js
node --check src/songForm.js
rg "innerHTML|tabindex=\"[1-9]" index.html src
```

Manual checks:

1. Navigate the entire app with Tab, Shift+Tab, Enter, Space, and Escape where
   natively supported.
2. Zoom the browser to 200 percent.
3. Test at approximately 320, 768, and 1280 CSS pixels.
4. Use browser accessibility inspection to confirm labels, live region, and
   accessible button names.
5. Trigger network, 404, validation, and successful CRUD notices.
6. Temporarily disable CSS and confirm the document order remains logical.

### Non-goals

- Do not add a UI framework, icon package, custom toast system, custom select,
  drag-and-drop widget, or custom modal.
- Do not pursue formal WCAG certification in this learning stage.
- Do not hide errors only in console output.

## State to make visible

For every API operation, decide what the user sees:

| State | Example feedback |
| --- | --- |
| Loading collection | "Loading songs..." near the list. |
| Loading selected song | "Loading song details..." in the editor region. |
| Saving create | Disable Save and show "Creating song...". |
| Saving edit | Disable Save and show "Saving changes...". |
| Deleting | Disable affected Delete button and show "Deleting...". |
| Success | "Song created", "Changes saved", or "Song deleted". |
| Failure | A clear action-specific message and an available retry path. |
| Empty data | "No songs yet. Create the first one." |

Use state names in code (`isLoadingSongs`, `isSaving`, `deletingSongId`) that
match these visible conditions.

## Error messages

An error should answer three questions:

1. What action failed?
2. Why, if the reason is known and safe to show?
3. What can the user do now?

Examples:

```text
Could not load songs. Check that the SongBook API is running, then try again.
Could not save changes because the song no longer exists. The list was refreshed.
The API rejected the submitted song. Review the entered values and try again.
```

Avoid only showing "Error", a console message, or an HTTP number with no
context. Keep technical details in browser developer tools during development.

## Keyboard and focus rules

- Use real `<button>` elements for actions; do not make a generic `<div>`
  clickable.
- Every form field needs a visible label.
- Keep the normal Tab order aligned with the visual order.
- After opening create mode, focus the Title field.
- After a validation failure, focus the first invalid field.
- After deletion, move focus to a useful nearby target, such as the list
  heading or New song button, rather than leaving it on a removed row.
- Make selected list state visible with more than color, such as a border,
  icon, or accessible current-state attribute.

Test the page with the mouse disconnected or ignored: Tab, Shift+Tab, Enter,
Space, and Escape should have predictable results.

## Announcements

Use a persistent live region for messages. The region should exist in the HTML
before its text changes; do not create and immediately remove it.

Use polite announcements for routine status changes. Reserve urgent alerts for
errors that need immediate attention. Do not make every loading message an
alert, or screen-reader users will receive too much interruption.

## Styling guidance

Add `styles/app.css` as the page grows. Cover:

- Readable base font size and line height.
- Clear focus indicator using `:focus-visible`.
- Distinct primary, neutral, and destructive buttons.
- A selected song row state that remains clear without color alone.
- Labels, inputs, and textareas with sufficient spacing.
- Error text near the relevant control.
- Responsive layout that stacks list and editor on small screens.
- Adequate button size for touch input.

Do not remove browser focus outlines without replacing them with an equally
visible style.

## Form accessibility

Use `aria-describedby` to connect an input with a field-specific error message
when needed. For a group of part controls, use `<fieldset>` and `<legend>` so
assistive technology understands that inputs belong together.

For a disabled Save button, make the reason visible in nearby text. A disabled
button cannot receive keyboard focus, so it cannot explain itself on its own.

## Robustness practices

- Disable only the controls that truly must wait; do not freeze the entire
  page for a detail request.
- Preserve typed form data after a network failure.
- Ensure error paths clear loading and busy flags in `finally` blocks.
- Avoid relying on the browser back button for internal state until routing is
  intentionally implemented.
- Do not store authentication-like secrets in frontend constants. This app has
  no authentication currently, but this rule matters later.
- Treat user-entered titles and lyrics as text, never as markup.

## Alternatives

### Toast notifications

Small temporary messages can look polished.

- Good for: brief success feedback.
- Trade-off: they may disappear before a user reads them and require careful
  live-region behavior.

A persistent status area is the recommended first implementation.

### Inline-only messages

Put every message directly near a field or row.

- Good for: field validation.
- Trade-off: global load and network errors have no natural location.

Use inline messages for form validation plus a page-level status area for
network operations.

### Custom accessible widgets

Tabs, custom dropdowns, and drag handles can be useful later.

- Good for: sophisticated interaction.
- Trade-off: keyboard and ARIA requirements are substantial.

Prefer native HTML controls while learning.

## Resources

- [MDN: Web accessibility](https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/Accessibility)
- [MDN: Keyboard-navigable JavaScript widgets](https://developer.mozilla.org/en-US/docs/Web/Accessibility/Guides/Keyboard-navigable_JavaScript_widgets)
- [MDN: `:focus-visible`](https://developer.mozilla.org/en-US/docs/Web/CSS/:focus-visible)
- [W3C WAI: Forms tutorial](https://www.w3.org/WAI/tutorials/forms/)
- [W3C WAI: Notifications](https://www.w3.org/WAI/WCAG21/Techniques/aria/ARIA19)

## Checkpoint

You are ready for final validation when every asynchronous operation has a
visible start, success, and failure state; all actions work by keyboard; and
errors preserve enough context for the user to recover.
