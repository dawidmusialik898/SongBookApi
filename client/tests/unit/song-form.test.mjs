import assert from "node:assert/strict"
import test from "node:test"

import { installTestBrowser } from "../helpers/testBrowser.mjs"

test("songForm exports exactly its four helpers", async () => {
    installTestBrowser(() => ({
        body: []
    }))
    const songForm = await import("../../src/songForm.js")

    assert.deepEqual(Object.keys(songForm).sort(), [
        "buildSongPayload",
        "createPartDraft",
        "populateSongForm",
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
