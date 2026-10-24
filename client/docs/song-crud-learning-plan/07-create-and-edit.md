# 07 - Create and Edit

## Goal

Use one form for both `POST /songs` and `PUT /songs/{id}`. The form should
create plain JavaScript payloads from user input, validate friendly
client-side rules, and never lose the selected song identity.

This stage follows the mandatory
[testing and documentation policy](00-overall-plan.md#testing-and-documentation-policy).

## AI implementation specification

### Status and prerequisites

This stage is complete. Points 02, 04, 05, and 06 are complete, including
route-authoritative updates and settable `Part.Id`.

### Files in scope

Add:

```text
SongBookClient/src/songForm.js
SongBookClient/tests/unit/song-form.test.mjs
SongBookClient/tests/integration/create-save.test.mjs
SongBookClient/tests/integration/edit-save.test.mjs
SongBookClient/tests/integration/editor-modes.test.mjs
SongBookClient/tests/integration/save-failure.test.mjs
SongBookClient/tests/functional/editor-workflow.test.mjs
```

Modify:

```text
SongBookClient/index.html
SongBookClient/src/main.js
SongBookClient/styles/app.css
SongBookClient/tests/helpers/testBrowser.mjs
SongBookClient/tests/unit/html-shell.test.mjs
SongBookClient/tests/unit/main-structure.test.mjs
SongBookClient/tests/functional/app-shell.test.mjs
SongBookClient/docs/song-crud-learning-plan/07-create-and-edit.md
```

Do not change the API in this stage unless validation proves point 02 was not
actually completed.

### `songForm.js` public contract

Export exactly these helpers:

```text
createPartDraft(part?)
populateSongForm(form, song?)
buildSongPayload(form, draftParts)
renderPartsEditor(container, draftParts)
```

Responsibilities:

- `createPartDraft(part?)` returns:

  ```js
  {
    clientKey: crypto.randomUUID(),
    id: part?.id ?? null,
    name: part?.name ?? "",
    text: part?.text ?? ""
  }
  ```

  `clientKey` is browser-only and must never be serialized.

- `populateSongForm` fills only scalar controls and uses empty strings for null
  API values.
- `buildSongPayload` trims scalar/part strings, converts blank strings to
  `null`, preserves existing part IDs, omits IDs for new parts, and returns no
  song `id` and no `order`.
  For a new object, the `id` key must be absent, not `"id": null`, because the
  API binds it to a non-nullable `Guid`. Strip both `clientKey` and null IDs
  rather than serializing draft objects directly.
- `renderPartsEditor` creates DOM nodes with `textContent`, not HTML strings.
  Each fieldset must expose its `clientKey` through `data-part-key`.

Use these `data-action` values for part buttons:

```text
move-part-up
move-part-down
remove-part
```

Use these `data-part-field` values:

```text
name
text
```

Move buttons must be disabled at the first/last positions respectively.

### State extension

Use the existing `state.draftParts` array. It is the only source of truth for
the editor's parts. DOM inputs update that array through delegated `input`
events. Add/move/remove operations update the array, then rerender the parts
editor.

Existing part IDs are preserved in draft state. New drafts have `id: null`.
Array position is the saved part order.

### Create mode

When `new-song-button` is selected:

1. Set `editorMode = "create"`.
2. Clear `selectedSongId` and `selectedSong`.
3. Reset the form and `draftParts`.
4. Set the heading to `"Create song"` and submit label to `"Create song"`.
5. Reveal the form and hide read-only details.
6. Focus `song-title`.

Reveal and enable `new-song-button` as part of this stage.

### Edit mode

Add an `Edit song` button to the read-only detail rendering. When selected:

1. Require a loaded `state.selectedSong`.
2. Set `editorMode = "edit"`.
3. Populate scalar form values from that song.
4. Map its parts through `createPartDraft`.
5. Set heading to `"Edit song"` and submit label to `"Save changes"`.
6. Reveal the form and keep `selectedSongId` as the authoritative song ID.

Do not read identity from a hidden input.

### Form submission

The form submit handler must:

1. Call `event.preventDefault()`.
2. Ignore duplicate submits while `state.isSaving` is true.
3. Run browser constraint validation with `checkValidity()` /
   `reportValidity()`.
4. Build one payload through `buildSongPayload`.
5. In create mode, call `createSong(payload)`.
6. In edit mode, call `updateSong(state.selectedSongId, payload)`.
7. Disable all form mutation controls and show the action-specific saving
   message while pending.
8. On create success, reload the collection and select the ID returned in the
   `201` response.
9. On update success, reload the collection and refetch the selected song
   because `204` contains no body.
10. Preserve all typed values after failure.
11. Restore controls in `finally`.

The API currently has no required-field or length validation. Do not mark
`title` required and do not invent `maxlength` values. Blank strings map to
`null`.

### Cancel behavior

- In create mode, Cancel clears the draft, hides the form, and returns to the
  idle/details view.
- In edit mode, Cancel discards the draft and restores the last successfully
  loaded read-only details.
- Do not prompt about unsaved changes in this first implementation.

### Part editor behavior

- `Add part` appends one empty draft and focuses its name input.
- Input events update the matching draft by `clientKey`.
- Move up/down changes only array position.
- Remove deletes only the matching draft.
- Existing IDs remain attached to their drafts through reorder operations.
- New part IDs are learned only after the successful save/refetch.
- Do not support repeated references to the same part; every array entry is one
  part.

### Acceptance criteria

- [x] One form supports both create and edit modes.
- [x] Create bodies contain no song or part IDs for new objects.
- [x] Update URLs use `selectedSongId`; bodies contain no song ID.
- [x] Existing part IDs are preserved and new part IDs are server-generated.
- [x] Parts save in visible array order.
- [x] Blank scalar/part values serialize as `null`.
- [x] `204` update success triggers collection and detail refetches.
- [x] Duplicate Save clicks issue one request.
- [x] Failed saves preserve typed data and part ordering.
- [x] Cancel in create and edit mode never sends a request.
- [x] Browser validation runs before a mutation request.
- [x] Form and part mutation controls are disabled while saving.
- [x] Unit, integration, and functional tests cover editor behavior.
- [x] The editor contract and validation commands are documented.

### Validation

```sh
node --check src/songForm.js
node --check src/main.js
node --check src/songsApi.js
rg 'innerHTML' src index.html
rg '"order"[[:space:]]*:' src index.html
node --test tests/unit/*.test.mjs
node --test tests/integration/*.test.mjs
node --test tests/functional/*.test.mjs
```

The unit layer verifies the exact `songForm.js` API, browser-only draft keys,
scalar population, null conversion, payload identity rules, labelled
fieldsets, literal values, and move boundaries. The integration layer verifies
create/edit/cancel modes, validation, duplicate submits, busy controls,
route-authoritative updates, `204` refetch, part identity/order, and failed
save preservation. The functional layer drives create and edit as one
server-backed workflow.

Browser acceptance:

1. Create a scalar-only song.
2. Create a song with two parts.
3. Edit scalar fields.
4. Edit an existing part and confirm its ID remains stable via Network/API
   inspection.
5. Add, reorder, and remove parts; refetch and confirm array order.
6. Cancel both create and edit.
7. Stop the API during save and confirm all input remains.

### Non-goals

- Do not add unsaved-change prompts, autosave, drag-and-drop, rich text, or
  repeated part references.
- Do not generate persistent song or part GUIDs in the browser.
- Do not add validation rules absent from the API contract.
- Do not split create and edit into separate forms.

## Start with scalar fields

Build the first working form with:

```text
Title
Author
Original title
Number
Key
Tempo
```

Each field needs a visible `<label>` and a stable `name` attribute. Using
matching `name` values lets `FormData` read the form predictably.

For example:

```text
name="title"
name="author"
name="originalTitle"
```

Do not use the label text itself as a JavaScript key. Labels are for users and
may change for wording or translation.

## One editor, two modes

Store an editor mode in state:

```text
"create"
"edit"
```

### Create flow

```text
Click New song
  -> set mode to create
  -> clear selected ID and form values
  -> focus the title field
  -> submit form
  -> create payload
  -> POST /songs
  -> select the created ID or refresh the list
```

### Edit flow

```text
Choose a song
  -> GET /songs/{id}
  -> set mode to edit
  -> populate the form from the response
  -> submit form
  -> preserve its ID
  -> PUT /songs/{id}
  -> refresh collection and detail
```

Set the submit button text from mode: "Create song" or "Save changes".
Do not use a separate form merely because the button text changes.

## Form data conversion

`new FormData(form)` is a useful browser API, but every value it returns is a
string. Convert deliberately:

1. Read the named values.
2. Trim surrounding whitespace.
3. Decide whether blank optional fields become `null` or an empty string.
4. Build a new payload object with exact API property names.
5. Attach parts from their own editor state.

Use one documented blank-value policy. `null` often communicates "not
provided" more clearly, while `""` is simpler if the API treats the two values
identically.

Do not submit the browser's form element, the `FormData` object, or state
objects directly as JSON. Make an explicit payload so you can inspect it in
the Network panel.

## Client-side validation

The server remains the authority, but the form can prevent obvious mistakes.

Suggested initial rules:

- Trim whitespace before checking required fields.
- Show a field-specific message near the problem.
- Move focus to the first invalid field after submit.
- Keep valid user input when validation fails.

The current API intentionally permits a null title, so the client must not make
title required in this stage. Display `"Untitled song"` when needed.

Use built-in HTML validation when the API later defines matching constraints.
The current API does not define required fields or maximum lengths.

## Parts and array order

Only implement this section after document 02's API contract checkpoint.

### Beginner-friendly part editor

Render each part as a fieldset containing:

```text
Part name input
Part text textarea
Move up button
Move down button
Remove part button
```

Add an "Add part" button outside the list. Use buttons rather than
drag-and-drop at first; buttons work with keyboard input and make ordering
logic much easier to learn.

For an existing song, retain each part's stable ID in editor state. For a new
part, omit the ID and let the server create it according to document 02.

After every add, remove, or move operation, derive the payload:

```text
parts: [part objects in editor state]
```

The array itself is the order. The current contract does not support repeated
references to one part.

## Save-state behavior

While saving:

- Disable the Save button.
- Disable controls that would change the payload.
- Show "Creating song..." or "Saving changes...".
- Do not clear the form until the API reports success.
- Re-enable controls in both success and failure paths.

After a successful `POST`, use the returned `201` song ID to select the new
song, then refresh the list to use server truth.

After a successful `PUT` with `204`, fetch the song again or refresh the
collection and reselect it. A `204` response has no body to render.

## Cancel and unsaved changes

The first version can make Cancel reset the form to its last loaded song or a
blank create form. Once that works, optionally track whether input differs
from the last saved values and ask before discarding edits.

Do not add a browser `beforeunload` warning as the first implementation. It
is harder to test and can be annoying. Start with an in-page Cancel action.

## Implementation steps

1. Wire the scalar form created in document 05.
2. Add a function that starts create mode and resets form controls.
3. Add a function that fills form controls from a fetched song.
4. On form submit, call `event.preventDefault()`.
5. Validate and construct a plain payload.
6. Branch on editor mode to call `createSong` or `updateSong`.
7. Refresh data only after a successful request.
8. Add the parts editor after round-trip API tests pass.
9. Test that the selected song ID cannot be accidentally changed by form
   input.

## Alternatives

### Separate create and edit forms

- Good for: drastically different fields or workflows.
- Trade-off: duplicated validation, markup, and payload code.

The SongBook fields are almost identical, so a shared form is recommended.

### JSON textarea for parts

- Good for: testing a stabilized API contract before building controls.
- Trade-off: users must understand JSON, and errors are harder to explain.

Use it only as a temporary developer tool.

### Drag-and-drop ordering

- Good for: polished interfaces with many parts.
- Trade-off: pointer and keyboard accessibility, hit targets, and complex
  reorder state.

Move-up and move-down buttons are the best first implementation.

## Resources

- [MDN: `FormData`](https://developer.mozilla.org/en-US/docs/Web/API/FormData)
- [MDN: Client-side form validation](https://developer.mozilla.org/en-US/docs/Learn_web_development/Extensions/Forms/Form_validation)
- [MDN: `preventDefault()`](https://developer.mozilla.org/en-US/docs/Web/API/Event/preventDefault)
- [MDN: `<fieldset>`](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/fieldset)
- [MDN: Focus management](https://developer.mozilla.org/en-US/docs/Web/Accessibility/Guides/Keyboard-navigable_JavaScript_widgets)

## Checkpoint

You are ready for deletion when a user can create a song, find it in the list,
open it again, change a field, save it, refresh the page data, and see the
changed value returned by the API.
