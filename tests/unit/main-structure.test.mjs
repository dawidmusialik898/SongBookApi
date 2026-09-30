import assert from "node:assert/strict"
import test from "node:test"

import { installTestBrowser } from "../helpers/testBrowser.mjs"

test("state and rendering remain explicit and loading is visible", async () => {
    let resolveInitialRequest
    const initialRequest = new Promise(resolve => {
        resolveInitialRequest = resolve
    })
    const browser = installTestBrowser(() => initialRequest)

    const app = await import("../../src/main.js")
    await new Promise(resolve => setImmediate(resolve))

    assert.deepEqual(Object.keys(app.state), [
        "songBooks",
        "selectedSongBookId",
        "selectedSongBook",
        "selectedSongBookAccessLevel",
        "songBookMembers",
        "songBookFormMode",
        "isLoadingSongBooks",
        "isLoadingSongBook",
        "isSavingSongBook",
        "isLoadingSongBookMembers",
        "isSavingSongBookAccess",
        "songs",
        "selectedSongId",
        "selectedSong",
        "editorMode",
        "isLoadingSongs",
        "isLoadingSong",
        "isSaving",
        "deletingSongId",
        "draftParts",
        "notice",
        "auth",
        "authView",
        "isAuthPending"
    ])
    assert.equal(app.state.isLoadingSongs, true)
    assert.equal(browser.getButton("Refresh songs").disabled, true)
    assert.equal(
        browser.getElement("song-list").getAttribute("aria-busy"),
        "true"
    )
    assert.equal(
        browser.getElement("song-list-state").textContent,
        "Loading songs..."
    )
    assert.equal(browser.getElement("new-song-button").hidden, true)
    assert.equal(browser.getElement("song-form").hidden, true)

    assert.equal(await app.loadSongs(), false)
    assert.equal(browser.requests.length, 1)

    resolveInitialRequest({ body: [] })
    await app.initialization

    assert.equal(app.state.isLoadingSongs, false)
    assert.equal(browser.getElement("new-song-button").hidden, false)
    assert.equal(browser.getButton("Refresh songs").disabled, false)
    assert.equal(
        browser.getElement("song-list").getAttribute("aria-busy"),
        "false"
    )
    assert.equal(
        browser.getElement("song-list-state").textContent,
        "No songs yet. Create the first one."
    )
    assert.equal(
        browser.getElement("app-status").textContent,
        "Song books loaded."
    )

    app.state.songs = [{
        id: "state-song",
        number: "1",
        title: "State song",
        author: "State author"
    }]

    app.renderSongList([{
        id: "rendered-song",
        number: "2",
        title: "Rendered song",
        author: "Rendered author"
    }])

    assert.deepEqual(
        browser.getSongSummaries(),
        ["2. Rendered song — Rendered author"]
    )
    assert.equal(app.state.songs[0].title, "State song")
    assert.equal(browser.requests.length, 1)
})
