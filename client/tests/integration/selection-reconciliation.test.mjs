import assert from "node:assert/strict"
import test from "node:test"

import { installTestBrowser } from "../helpers/testBrowser.mjs"

test("a successful collection refresh clears a missing selection", async () => {
    let collectionRequests = 0
    const song = {
        id: "song-1",
        title: "Selected song",
        parts: []
    }
    const browser = installTestBrowser(request => {
        if (request.url.endsWith("/songs")) {
            collectionRequests += 1
            return {
                body: collectionRequests === 1 ? [song] : []
            }
        }

        if (request.url.endsWith("/songs/song-1")) {
            return collectionRequests > 1
                ? { body: { title: "Not found" }, status: 404 }
                : { body: song }
        }

        throw new Error(`Unexpected request: ${request.url}`)
    })

    const app = await import("../../src/main.js")
    await app.initialization
    await browser.getButton("View").click()

    assert.equal(app.state.selectedSongId, "song-1")
    assert.equal(app.state.selectedSong.id, "song-1")

    await browser.getButton("Refresh songs").click()

    assert.equal(app.state.selectedSongId, null)
    assert.equal(app.state.selectedSong, null)
    assert.equal(app.state.isLoadingSong, false)
    assert.equal(
        browser.getElement("song-details").textContent,
        "Select a song to view its details."
    )
    assert.equal(
        browser.getElement("app-status").textContent,
        "Songs loaded. The selected song is no longer available."
    )
})
