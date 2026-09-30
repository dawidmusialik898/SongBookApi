import assert from "node:assert/strict"
import test from "node:test"

import { installTestBrowser } from "../helpers/testBrowser.mjs"

test("deleting another song leaves the selected editor enabled", async () => {
    const deleteResponse = createDeferred()
    const songs = [
        {
            id: "song-a",
            title: "Song A",
            parts: []
        },
        {
            id: "song-b",
            title: "Song B",
            parts: []
        }
    ]
    const browser = installTestBrowser(request => {
        if (request.url.endsWith("/songs") && request.method === "GET") {
            return {
                body: songs
            }
        }

        if (
            request.url.endsWith("/songs/song-a") &&
            request.method === "GET"
        ) {
            return {
                body: songs[0]
            }
        }

        if (
            request.url.endsWith("/songs/song-b") &&
            request.method === "DELETE"
        ) {
            return deleteResponse.promise
        }

        throw new Error(
            `Unexpected request: ${request.method} ${request.url}`
        )
    })
    const app = await import("../../src/main.js")
    await app.initialization
    await browser.getButtons("View").find(
        button => button.dataset.songId === "song-a"
    ).click()
    await browser.getButton("Edit song").click()

    const pendingDelete = findDeleteButton(browser, "song-b").click()

    assert.equal(app.state.deletingSongId, "song-b")
    assert.equal(findDeleteButton(browser, "song-b").disabled, true)
    assert.equal(findDeleteButton(browser, "song-a").disabled, false)
    assert.equal(browser.getElement("song-title").disabled, false)
    assert.equal(browser.getElement("save-song-button").disabled, false)

    songs.splice(1, 1)
    deleteResponse.resolve({
        body: null,
        status: 204
    })
    await pendingDelete

    assert.equal(app.state.selectedSongId, "song-a")
    assert.equal(app.state.editorMode, "edit")
    assert.equal(browser.getElement("song-form").hidden, false)
    assert.equal(browser.getElement("song-title").disabled, false)
    assert.deepEqual(browser.getSongSummaries(), ["Song A"])
})

function findDeleteButton(browser, songId) {
    return browser.getButtons("Delete").find(
        button =>
            button.dataset.songId === songId &&
            button.parentNode.className === "song-list__actions"
    )
}

function createDeferred() {
    let resolve
    const promise = new Promise(resolvePromise => {
        resolve = resolvePromise
    })

    return {
        promise,
        resolve
    }
}
