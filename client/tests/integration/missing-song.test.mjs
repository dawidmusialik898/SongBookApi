import assert from "node:assert/strict"
import test from "node:test"

import { installTestBrowser } from "../helpers/testBrowser.mjs"

test("an individual 404 clears selection and refreshes the collection once", async () => {
    let collectionRequests = 0
    const browser = installTestBrowser(request => {
        if (request.url.endsWith("/songs")) {
            collectionRequests += 1
            return {
                body: collectionRequests === 1
                    ? [{
                        id: "missing-song",
                        title: "Soon removed",
                        parts: []
                    }]
                    : []
            }
        }

        if (request.url.endsWith("/songs/missing-song")) {
            return {
                body: {
                    message: "Not found"
                },
                status: 404
            }
        }

        throw new Error(`Unexpected request: ${request.url}`)
    })
    const loggedErrors = []
    const originalConsoleError = console.error
    console.error = error => {
        loggedErrors.push(error)
    }

    try {
        const app = await import("../../src/main.js")
        await app.initialization
        await browser.getButton("View").click()

        assert.equal(app.state.selectedSongId, null)
        assert.equal(app.state.selectedSong, null)
        assert.equal(app.state.isLoadingSong, false)
        assert.deepEqual(app.state.songs, [])
        assert.equal(collectionRequests, 2)
        assert.deepEqual(
            browser.requests.map(request => request.url),
            [
                "/songbooks/default-book/songs",
                "/songbooks/default-book/songs/missing-song",
                "/songbooks/default-book/songs"
            ]
        )
        assert.equal(
            browser.getElement("song-details").textContent,
            "Select a song to view its details."
        )
        assert.equal(
            browser.getElement("app-status").textContent,
            "This song no longer exists. The list was refreshed."
        )
        assert.equal(loggedErrors[0].status, 404)
    } finally {
        console.error = originalConsoleError
    }
})
