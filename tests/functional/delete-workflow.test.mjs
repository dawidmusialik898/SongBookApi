import assert from "node:assert/strict"
import test from "node:test"

import { installTestBrowser } from "../helpers/testBrowser.mjs"

test("delete workflow handles cancel, non-selected, selected, and stale songs", async () => {
    const songs = new Map([
        ["song-a", {
            id: "song-a",
            title: "Song A",
            parts: []
        }],
        ["song-b", {
            id: "song-b",
            title: "Song B",
            parts: []
        }]
    ])
    const browser = installTestBrowser(request => {
        const url = new URL(request.url, "https://localhost/")
        const id = url.pathname.split("/").filter(Boolean)[1] ?? null

        if (id === null && request.method === "GET") {
            return {
                body: [...songs.values()].map(
                    song => structuredClone(song)
                )
            }
        }

        if (id !== null && request.method === "GET" && songs.has(id)) {
            return {
                body: structuredClone(songs.get(id))
            }
        }

        if (id !== null && request.method === "DELETE") {
            if (!songs.delete(id)) {
                return {
                    body: {
                        message: "Not found"
                    },
                    status: 404
                }
            }

            return {
                body: null,
                status: 204
            }
        }

        return {
            body: {
                message: "Not found"
            },
            status: 404
        }
    })
    const app = await import("../../src/main.js")
    await app.initialization
    await findViewButton(browser, "song-a").click()

    browser.queueConfirmResult(false)
    const cancelledDelete = findDeleteButton(browser, "song-b")
    await cancelledDelete.click()
    assert.equal(songs.has("song-b"), true)
    assert.equal(browser.document.activeElement, cancelledDelete)

    browser.queueConfirmResult(true)
    await findDeleteButton(browser, "song-b").click()
    assert.equal(songs.has("song-b"), false)
    assert.equal(app.state.selectedSongId, "song-a")
    assert.equal(app.state.selectedSong.id, "song-a")
    assert.deepEqual(browser.getSongSummaries(), ["Song A"])
    assert.equal(
        browser.getElement("app-status").textContent,
        "Song deleted."
    )
    assert.equal(
        browser.document.activeElement.dataset.action,
        "view-song"
    )
    assert.equal(
        browser.document.activeElement.dataset.songId,
        "song-a"
    )

    browser.queueConfirmResult(true)
    await findDetailDeleteButton(browser).click()
    assert.equal(songs.size, 0)
    assert.equal(app.state.selectedSongId, null)
    assert.deepEqual(browser.getSongSummaries(), [])
    assert.equal(
        browser.document.activeElement,
        browser.getElement("new-song-button")
    )

    songs.set("song-c", {
        id: "song-c",
        title: "Song C",
        parts: []
    })
    await app.loadSongs()
    await findViewButton(browser, "song-c").click()
    songs.delete("song-c")

    browser.queueConfirmResult(true)
    const loggedErrors = []
    const originalConsoleError = console.error
    console.error = error => {
        loggedErrors.push(error)
    }

    try {
        await findDetailDeleteButton(browser).click()
    } finally {
        console.error = originalConsoleError
    }

    assert.equal(app.state.selectedSongId, null)
    assert.deepEqual(browser.getSongSummaries(), [])
    assert.equal(
        browser.getElement("app-status").textContent,
        "This song was already removed."
    )
    assert.equal(
        browser.document.activeElement,
        browser.getElement("new-song-button")
    )
    assert.equal(loggedErrors[0].status, 404)
})

function findViewButton(browser, songId) {
    return browser.getButtons("View").find(
        button => button.dataset.songId === songId
    )
}

function findDeleteButton(browser, songId) {
    return browser.getButtons("Delete").find(
        button =>
            button.dataset.songId === songId &&
            button.parentNode.className === "song-list__actions"
    )
}

function findDetailDeleteButton(browser) {
    return browser.getButtons("Delete").find(
        button => button.parentNode.className === "song-details__actions"
    )
}
