import assert from "node:assert/strict"
import test from "node:test"

import { installTestBrowser } from "../helpers/testBrowser.mjs"

test("create and edit modes share one form and Cancel sends no request", async () => {
    const song = {
        id: "song-1",
        title: "Existing song",
        author: null,
        originalTitle: "Original",
        number: "4",
        key: "D",
        tempo: null,
        parts: [
            {
                id: "part-1",
                name: "Verse",
                text: "Existing text"
            }
        ]
    }
    const browser = installTestBrowser(request => {
        if (request.url.endsWith("/songs")) {
            return {
                body: [song]
            }
        }

        if (request.url.endsWith("/songs/song-1")) {
            return {
                body: song
            }
        }

        throw new Error(`Unexpected request: ${request.url}`)
    })
    const app = await import("../../src/main.js")
    await app.initialization
    const initialRequestCount = browser.requests.length

    await browser.getButton("New song").click()

    assert.equal(app.state.editorMode, "create")
    assert.equal(app.state.selectedSongId, null)
    assert.equal(app.state.selectedSong, null)
    assert.deepEqual(app.state.draftParts, [])
    assert.equal(browser.getElement("song-form").hidden, false)
    assert.equal(browser.getElement("song-details").hidden, true)
    assert.equal(
        browser.getElement("song-form-heading").textContent,
        "Create song"
    )
    assert.equal(
        browser.getElement("save-song-button").textContent,
        "Create song"
    )
    assert.equal(browser.document.activeElement.id, "song-title")

    await browser.getButton("Add part").click()
    assert.equal(app.state.draftParts.length, 1)
    assert.equal(app.state.draftParts[0].id, null)
    assert.equal(
        browser.document.activeElement.dataset.partField,
        "name"
    )

    await browser.getButton("Cancel").click()

    assert.equal(app.state.editorMode, "idle")
    assert.equal(browser.getElement("song-form").hidden, true)
    assert.equal(browser.getElement("song-details").hidden, false)
    assert.equal(browser.requests.length, initialRequestCount)
    assert.equal(
        browser.document.activeElement,
        browser.getElement("new-song-button")
    )

    await browser.getButton("View").click()
    await browser.getButton("Edit song").click()

    assert.equal(app.state.editorMode, "edit")
    assert.equal(app.state.selectedSongId, "song-1")
    assert.equal(browser.getElement("song-title").value, "Existing song")
    assert.equal(browser.getElement("song-author").value, "")
    assert.equal(browser.getElement("song-original-title").value, "Original")
    assert.equal(browser.getElement("song-number").value, "4")
    assert.equal(browser.getElement("song-key").value, "D")
    assert.equal(browser.getElement("song-tempo").value, "")
    assert.equal(app.state.draftParts.length, 1)
    assert.equal(app.state.draftParts[0].id, "part-1")
    assert.equal(app.state.draftParts[0].name, "Verse")
    assert.equal(
        browser.getElement("song-form-heading").textContent,
        "Edit song"
    )
    assert.equal(
        browser.getElement("save-song-button").textContent,
        "Save changes"
    )

    const requestCountBeforeEditCancel = browser.requests.length
    await browser.getButton("Cancel").click()

    assert.equal(app.state.editorMode, "idle")
    assert.equal(app.state.selectedSongId, "song-1")
    assert.equal(app.state.selectedSong.id, "song-1")
    assert.equal(browser.getElement("song-form").hidden, true)
    assert.match(
        browser.getElement("song-details").textContent,
        /TitleExisting song/
    )
    assert.equal(browser.requests.length, requestCountBeforeEditCancel)
    assert.equal(
        browser.document.activeElement,
        browser.getButton("Edit song")
    )
})
