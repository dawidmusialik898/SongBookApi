import assert from "node:assert/strict"
import test from "node:test"

import { installTestBrowser } from "../helpers/testBrowser.mjs"

test("app shell loads, refreshes, and returns to a truthful empty state", async () => {
    const serverSongs = []
    const browser = installTestBrowser(request => {
        assert.equal(request.method, "GET")
        return {
            body: structuredClone(serverSongs)
        }
    })

    const app = await import("../../src/main.js")
    await app.initialization

    assert.deepEqual(browser.getSongListText(), [])
    assert.equal(
        browser.getElement("song-list-state").textContent,
        "No songs yet. Create the first one."
    )
    assert.equal(browser.getElement("song-list-state").hidden, false)
    assert.equal(browser.getElement("new-song-button").hidden, false)
    assert.equal(browser.getElement("song-form").hidden, true)
    assert.equal(browser.requests.length, 1)

    serverSongs.push({
        id: "song-1",
        number: "1",
        title: "Shell song",
        author: "Shell author"
    })
    await browser.getButton("Refresh songs").click()

    assert.equal(browser.requests.length, 2)
    assert.equal(app.state.songs.length, 1)
    assert.deepEqual(
        browser.getSongSummaries(),
        ["1. Shell song — Shell author"]
    )
    assert.equal(browser.getElement("song-list-state").hidden, true)

    serverSongs.length = 0
    await browser.getButton("Refresh songs").click()

    assert.equal(browser.requests.length, 3)
    assert.deepEqual(browser.getSongListText(), [])
    assert.equal(
        browser.getElement("song-list-state").textContent,
        "No songs yet. Create the first one."
    )
    assert.equal(browser.getElement("song-list-state").hidden, false)
})
