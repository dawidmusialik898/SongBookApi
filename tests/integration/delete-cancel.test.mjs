import assert from "node:assert/strict"
import test from "node:test"

import { installTestBrowser } from "../helpers/testBrowser.mjs"

test("cancelling deletion changes no state and sends no request", async () => {
    const song = {
        id: "song-1",
        title: "Keep this song",
        parts: []
    }
    const browser = installTestBrowser(request => {
        if (request.url.endsWith("/songs")) {
            return {
                body: [song]
            }
        }

        throw new Error(
            `Unexpected request: ${request.method} ${request.url}`
        )
    })
    const app = await import("../../src/main.js")
    await app.initialization

    browser.queueConfirmResult(false)
    const deleteButton = browser.getButton("Delete")
    const songsBefore = structuredClone(app.state.songs)
    const noticeBefore = structuredClone(app.state.notice)
    const requestCountBefore = browser.requests.length
    await deleteButton.click()

    assert.deepEqual(
        browser.confirmations,
        ['Delete "Keep this song"? This cannot be undone.']
    )
    assert.equal(browser.requests.length, requestCountBefore)
    assert.equal(app.state.deletingSongId, null)
    assert.deepEqual(app.state.songs, songsBefore)
    assert.deepEqual(app.state.notice, noticeBefore)
    assert.equal(browser.document.activeElement, deleteButton)
})
