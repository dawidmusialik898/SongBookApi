import assert from "node:assert/strict"
import test from "node:test"

import { installTestBrowser } from "../helpers/testBrowser.mjs"

test("sidebar book names switch the selected book and its songs", async () => {
    const books = [
        {
            id: "book-1",
            name: "First collection",
            accessLevel: "reader",
            songCount: 1
        },
        {
            id: "book-2",
            name: "Second collection",
            accessLevel: "reader",
            songCount: 1
        }
    ]
    let selectedBookId = null
    const browser = installTestBrowser(
        () => ({
            body: [{
                id: `song-in-${selectedBookId}`,
                title: `Song in ${selectedBookId}`,
                parts: []
            }]
        }),
        {
            songBookHandler: request => {
                const segments = new URL(
                    request.url,
                    "https://localhost/"
                ).pathname.split("/").filter(Boolean)

                if (segments.length === 1) {
                    return { body: books }
                }

                if (segments.length === 2) {
                    selectedBookId = segments[1]
                    return {
                        body: books.find(book => book.id === selectedBookId)
                    }
                }

                throw new Error(`Unexpected request: ${request.url}`)
            }
        }
    )
    const app = await import("../../src/main.js")
    await app.initialization

    assert.equal(app.state.selectedSongBookId, null)
    assert.equal(
        browser.getElement("selected-song-book-panel").hidden,
        true
    )
    const bookNames = browser.findElements(
        element => element.className === "song-book-list__summary"
    )

    await bookNames[0].click()
    assert.equal(app.state.selectedSongBookId, "book-1")
    assert.deepEqual(browser.getSongSummaries(), ["Song in book-1"])
    assert.equal(
        browser.document.activeElement.id,
        "selected-song-book-heading"
    )
    assert.equal(
        browser.findElements(element =>
            element.dataset?.songBookId === "book-1"
        )[0].getAttribute("aria-current"),
        "true"
    )

    const secondBookName = browser.findElements(
        element => element.className === "song-book-list__summary"
    )[1]
    await secondBookName.click()
    assert.equal(app.state.selectedSongBookId, "book-2")
    assert.deepEqual(browser.getSongSummaries(), ["Song in book-2"])
    assert.equal(
        browser.getElement("selected-song-book-heading").textContent,
        "Second collection (Reader)"
    )
    assert.equal(
        browser.findElements(element =>
            element.dataset?.songBookId === "book-1"
        )[0].getAttribute("aria-current"),
        null
    )
})
