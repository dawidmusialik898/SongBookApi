import assert from "node:assert/strict"
import test from "node:test"

import { installTestBrowser } from "../helpers/testBrowser.mjs"

test("songForm exports its form and chord editor helpers", async () => {
    installTestBrowser(() => ({
        body: []
    }))
    const songForm = await import("../../src/songForm.js")

    assert.deepEqual(Object.keys(songForm).sort(), [
        "buildSongPayload",
        "createPartDraft",
        "populateSongForm",
        "renderChordEditor",
        "renderPartsEditor"
    ])
})

test("drafts and payloads preserve existing IDs but omit browser-only data", async () => {
    const browser = installTestBrowser(() => ({
        body: []
    }))
    const {
        buildSongPayload,
        createPartDraft,
        populateSongForm
    } = await import("../../src/songForm.js")
    const form = browser.getElement("song-form")

    const existingDraft = createPartDraft({
        id: "existing-part-id",
        name: " Verse ",
        text: " Existing text "
    })
    const newDraft = createPartDraft()

    assert.equal(existingDraft.id, "existing-part-id")
    assert.equal(existingDraft.name, " Verse ")
    assert.equal(existingDraft.text, " Existing text ")
    assert.notEqual(existingDraft.clientKey, newDraft.clientKey)
    assert.equal(newDraft.id, null)
    assert.equal(newDraft.name, "")
    assert.equal(newDraft.text, "")

    populateSongForm(form, {
        title: " Existing title ",
        author: null,
        originalTitle: undefined,
        number: " 7 ",
        key: "",
        tempo: " Moderate "
    })
    assert.equal(browser.getElement("song-title").value, " Existing title ")
    assert.equal(browser.getElement("song-author").value, "")

    browser.getElement("song-author").value = "  "
    newDraft.name = " Chorus "
    newDraft.text = "   "

    const payload = buildSongPayload(form, [existingDraft, newDraft])

    assert.deepEqual(payload, {
        title: "Existing title",
        author: null,
        originalTitle: null,
        number: "7",
        key: null,
        tempo: "Moderate",
        parts: [
            {
                id: "existing-part-id",
                name: "Verse",
                text: "Existing text"
            },
            {
                name: "Chorus",
                text: null
            }
        ]
    })
    assert.equal(Object.hasOwn(payload, "id"), false)
    assert.equal(Object.hasOwn(payload, "order"), false)
    assert.equal(Object.hasOwn(payload.parts[0], "clientKey"), false)
    assert.equal(Object.hasOwn(payload.parts[1], "id"), false)
})

test("chorded drafts copy annotations and preserve every lyric character", async () => {
    const browser = installTestBrowser(() => ({ body: [] }))
    const { buildSongPayload, createPartDraft } =
        await import("../../src/songForm.js")
    const original = {
        id: "part-1",
        name: "Verse",
        text: " A\r\n🎸 ",
        chords: [
            { offset: 0, symbol: "G" },
            { offset: 4, symbol: "Em" }
        ]
    }
    const draft = createPartDraft(original)
    assert.equal(draft.text, " A\n🎸 ")
    assert.deepEqual(draft.chords, [
        { offset: 0, symbol: "G" },
        { offset: 3, symbol: "Em" }
    ])
    draft.chords[0].symbol = "C"
    assert.equal(original.chords[0].symbol, "G")

    const form = browser.getElement("song-form")
    const payload = buildSongPayload(form, [draft])
    assert.deepEqual(payload.parts, [{
        id: "part-1",
        name: "Verse",
        text: " A\n🎸 ",
        chords: [
            { offset: 0, symbol: "C" },
            { offset: 3, symbol: "Em" }
        ]
    }])
    draft.chords = []
    draft.chordsEdited = true
    assert.deepEqual(buildSongPayload(form, [draft]).parts[0], {
        id: "part-1",
        name: "Verse",
        text: "A\n🎸",
        chords: []
    })
})

test("parts editor renders labelled controls, keys, and move boundaries", async () => {
    const browser = installTestBrowser(() => ({
        body: []
    }))
    const { renderPartsEditor } = await import("../../src/songForm.js")
    const container = browser.getElement("parts-editor")
    const draftParts = [
        {
            clientKey: "first-key",
            id: "first-id",
            name: "<strong>Verse</strong>",
            text: "Line one\nLine two"
        },
        {
            clientKey: "second-key",
            id: null,
            name: "Chorus",
            text: ""
        }
    ]

    renderPartsEditor(container, draftParts)

    const fieldsets = browser.findElements(
        element => element.tagName === "FIELDSET"
    )
    assert.equal(fieldsets.length, 2)
    assert.equal(fieldsets[0].dataset.partKey, "first-key")
    assert.equal(fieldsets[1].dataset.partKey, "second-key")

    const nameInputs = browser.findElements(
        element => element.dataset.partField === "name"
    )
    const textInputs = browser.findElements(
        element => element.dataset.partField === "text"
    )
    assert.deepEqual(
        nameInputs.map(input => input.value),
        ["<strong>Verse</strong>", "Chorus"]
    )
    assert.deepEqual(
        textInputs.map(input => input.value),
        ["Line one\nLine two", ""]
    )

    const moveUpButtons = browser.findElements(
        element => element.textContent === "Move up"
    )
    const moveDownButtons = browser.findElements(
        element => element.textContent === "Move down"
    )
    assert.equal(moveUpButtons[0].disabled, true)
    assert.equal(moveUpButtons[1].disabled, false)
    assert.equal(moveDownButtons[0].disabled, false)
    assert.equal(moveDownButtons[1].disabled, true)
    assert.equal(
        browser.findElements(
            element => element.textContent === "Remove part"
        ).length,
        2
    )
})

test("adding and reordering parts retain existing lyric controls", async () => {
    const browser = installTestBrowser(() => ({ body: [] }))
    const { renderPartsEditor } = await import("../../src/songForm.js")
    const container = browser.getElement("parts-editor")
    const drafts = [
        { clientKey: "first", name: "Verse", text: "Long lyric" },
        { clientKey: "second", name: "Chorus", text: "Other lyric" }
    ]

    renderPartsEditor(container, drafts)
    const firstFieldset = container.children[0]
    const secondFieldset = container.children[1]
    const firstTextarea = firstFieldset.children[2].children[1]
    drafts.push({ clientKey: "third", name: "Bridge", text: "" })
    renderPartsEditor(container, drafts)
    assert.equal(container.children[0], firstFieldset)
    assert.equal(firstFieldset.children[2].children[1], firstTextarea)

    drafts.reverse()
    renderPartsEditor(container, drafts)
    assert.equal(container.children[1], secondFieldset)
    assert.equal(container.children[2], firstFieldset)
    assert.equal(firstFieldset.children[2].children[1], firstTextarea)
    assert.equal(firstTextarea.value, "Long lyric")
    assert.equal(firstFieldset.children[0].textContent, "Part 3")

    drafts.pop()
    renderPartsEditor(container, drafts)
    assert.equal(container.children.length, 2)
    assert.equal(firstFieldset.parentNode, null)
})
