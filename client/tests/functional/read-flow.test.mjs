import assert from "node:assert/strict"
import test from "node:test"

import { installTestBrowser } from "../helpers/testBrowser.mjs"

test("collection and individual reads form a complete user workflow", async () => {
    const failedIds = new Set()
    const songs = new Map([
        ["song-1", {
            id: "song-1",
            title: "First song",
            author: null,
            originalTitle: null,
            number: "1",
            key: "C",
            tempo: null,
            parts: [{
                id: "part-1",
                name: "Verse",
                text: "First line\nSecond line"
            }]
        }],
        ["song-2", {
            id: "song-2",
            title: "Druga pieśń",
            author: "Autor",
            originalTitle: " ",
            number: null,
            key: null,
            tempo: "Slow",
            parts: []
        }]
    ])
    const browser = installTestBrowser(request => {
        const url = new URL(request.url, "https://localhost/")
        const id = url.pathname.split("/").filter(Boolean)[1] ?? null

        if (id === null) {
            return {
                body: [...songs.values()]
            }
        }

        if (!songs.has(id)) {
            return {
                body: {
                    message: "Not found"
                },
                status: 404
            }
        }

        if (failedIds.has(id)) {
            return {
                body: {
                    message: "Unavailable"
                },
                status: 503
            }
        }

        return {
            body: songs.get(id)
        }
    })

    const app = await import("../../src/main.js")
    await app.initialization

    assert.deepEqual(browser.getSongSummaries(), [
        "1. First song",
        "Druga pieśń — Autor"
    ])

    await browser.getButtons("View").find(
        button => button.dataset.songId === "song-1"
    ).click()
    assert.equal(app.state.selectedSongId, "song-1")
    assert.match(
        browser.getElement("song-details").textContent,
        /First line\nSecond line/
    )

    const loggedErrors = []
    const originalConsoleError = console.error
    console.error = error => {
        loggedErrors.push(error)
    }

    try {
        failedIds.add("song-1")
        await browser.getButtons("View").find(
            button => button.dataset.songId === "song-1"
        ).click()
        failedIds.delete("song-1")

        assert.equal(app.state.selectedSongId, "song-1")
        assert.equal(app.state.selectedSong, null)
        assert.equal(
            browser.getElement("song-details").textContent,
            "Song details could not be loaded. Use View to try again."
        )
        assert.equal(
            browser.getElement("app-status").textContent,
            "The server could not load song details. " +
                "Select the song again to retry."
        )
        assert.equal(
            browser.getElement("app-status").getAttribute("role"),
            "alert"
        )

        await browser.getButtons("View").find(
            button => button.dataset.songId === "song-2"
        ).click()
        assert.equal(app.state.selectedSongId, "song-2")
        assert.match(
            browser.getElement("song-details").textContent,
            /TitleDruga pieśń/
        )
        assert.match(
            browser.getElement("song-details").textContent,
            /Original titleNot provided/
        )

        songs.delete("song-2")
        await browser.getButtons("View").find(
            button => button.dataset.songId === "song-2"
        ).click()

        assert.equal(app.state.selectedSongId, null)
        assert.deepEqual(browser.getSongSummaries(), ["1. First song"])
        assert.equal(
            browser.getElement("app-status").textContent,
            "This song no longer exists. The list was refreshed."
        )
    } finally {
        console.error = originalConsoleError
    }

    assert.deepEqual(
        loggedErrors.map(error => error.status),
        [503, 404]
    )
})
