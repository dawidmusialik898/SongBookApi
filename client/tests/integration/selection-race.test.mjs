import assert from "node:assert/strict"
import test from "node:test"

import { installTestBrowser } from "../helpers/testBrowser.mjs"

test("a late song response cannot replace the newer selection", async () => {
    const songAResponse = createDeferred()
    const songBResponse = createDeferred()
    const browser = installTestBrowser(request => {
        if (request.url.endsWith("/songs")) {
            return {
                body: [
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
            }
        }

        if (request.url.endsWith("/songs/song-a")) {
            return songAResponse.promise
        }

        if (request.url.endsWith("/songs/song-b")) {
            return songBResponse.promise
        }

        throw new Error(`Unexpected request: ${request.url}`)
    })

    const app = await import("../../src/main.js")
    await app.initialization

    const songAButton = browser.getButtons("View").find(
        button => button.dataset.songId === "song-a"
    )
    const songAClick = songAButton.click()
    const songBButton = browser.getButtons("View").find(
        button => button.dataset.songId === "song-b"
    )
    const songBClick = songBButton.click()

    assert.equal(app.state.selectedSongId, "song-b")
    assert.equal(app.state.isLoadingSong, true)
    assert.equal(
        browser.getElement("song-details").textContent,
        "Loading song details..."
    )
    assert.equal(
        browser.getElement("song-details").getAttribute("aria-busy"),
        "true"
    )

    songBResponse.resolve({
        body: {
            id: "song-b",
            title: "Song B",
            author: "Current author",
            parts: []
        }
    })
    await songBClick

    assert.equal(app.state.selectedSong.id, "song-b")
    assert.equal(
        browser.getElement("song-details").getAttribute("aria-busy"),
        "false"
    )
    assert.match(
        browser.getElement("song-details").textContent,
        /TitleSong B/
    )

    songAResponse.resolve({
        body: {
            id: "song-a",
            title: "Song A",
            author: "Late author",
            parts: []
        }
    })
    await songAClick

    assert.equal(app.state.selectedSongId, "song-b")
    assert.equal(app.state.selectedSong.id, "song-b")
    assert.doesNotMatch(
        browser.getElement("song-details").textContent,
        /Late author/
    )
})

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
