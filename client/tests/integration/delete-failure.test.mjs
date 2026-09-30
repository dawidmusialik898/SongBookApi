import assert from "node:assert/strict"
import test from "node:test"

import { installTestBrowser } from "../helpers/testBrowser.mjs"

test("pending and failed deletion stay single-target and preserve editor state", async () => {
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
            request.url.endsWith("/songs/song-a") &&
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
    browser.getElement("song-title").value = "Unsaved edit"

    const deleteButton = findDeleteButton(browser, "song-a")
    const firstDelete = deleteButton.click()
    await new Promise(resolve => setImmediate(resolve))

    assert.equal(app.state.deletingSongId, "song-a")
    assert.equal(
        browser.getElement("app-status").textContent,
        "Deleting song..."
    )
    assert.equal(findDeleteButton(browser, "song-a").disabled, true)
    assert.equal(findDeleteButton(browser, "song-b").disabled, false)
    assert.equal(browser.getElement("save-song-button").disabled, true)
    assert.equal(browser.getElement("song-title").disabled, true)

    const duplicateResult = await app.requestSongDeletion(
        "song-a",
        findDeleteButton(browser, "song-a")
    )
    assert.equal(duplicateResult, false)
    assert.equal(browser.confirmations.length, 1)
    assert.equal(
        browser.requests.filter(request => request.method === "DELETE").length,
        1
    )

    const loggedErrors = []
    const originalConsoleError = console.error
    console.error = error => {
        loggedErrors.push(error)
    }
    deleteResponse.resolve({
        body: {
            message: "Unavailable"
        },
        status: 500
    })

    try {
        await firstDelete
    } finally {
        console.error = originalConsoleError
    }

    assert.equal(app.state.deletingSongId, null)
    assert.equal(app.state.selectedSongId, "song-a")
    assert.equal(app.state.editorMode, "edit")
    assert.equal(browser.getElement("song-title").value, "Unsaved edit")
    assert.equal(browser.getElement("song-title").disabled, false)
    assert.equal(browser.getElement("save-song-button").disabled, false)
    assert.deepEqual(browser.getSongSummaries(), ["Song A", "Song B"])
    assert.equal(
        browser.getElement("app-status").textContent,
        "The server could not delete the song. " +
            "The song remains available. Try again."
    )
    assert.equal(
        browser.getElement("app-status").getAttribute("role"),
        "alert"
    )
    assert.equal(
        browser.document.activeElement,
        findDeleteButton(browser, "song-a")
    )
    assert.equal(loggedErrors[0].status, 500)
})

function findDeleteButton(browser, songId) {
    return browser.getButtons("Delete").find(
        button => button.dataset.songId === songId
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
