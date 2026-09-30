import assert from "node:assert/strict"
import test from "node:test"

import { installTestBrowser } from "../helpers/testBrowser.mjs"

test("an edit 404 probes the book and clears revoked private data", async () => {
    let accessible = true
    const song = { id: "song-1", title: "Private", parts: [] }
    const browser = installTestBrowser(
        request => {
            if (request.url.endsWith("/songs")) {
                return accessible
                    ? { body: [song] }
                    : { body: { title: "Not found" }, status: 404 }
            }

            if (request.method === "GET") {
                return { body: song }
            }

            if (request.method === "PUT") {
                accessible = false
                return { body: { title: "Not found" }, status: 404 }
            }

            throw new Error(
                `Unexpected song request ${request.method} ${request.url}`
            )
        },
        {
            songBookHandler: request => {
                const segments = new URL(
                    request.url,
                    "https://localhost/"
                ).pathname.split("/").filter(Boolean)

                if (segments.length === 1) {
                    return { body: accessible ? [bookSummary()] : [] }
                }

                if (segments.length === 2) {
                    return accessible
                        ? { body: bookSummary() }
                        : {
                            body: { title: "Not found" },
                            status: 404
                        }
                }

                if (segments.at(-1) === "access" && accessible) {
                    return { body: [] }
                }

                return { body: { title: "Not found" }, status: 404 }
            }
        }
    )
    const app = await import("../../src/main.js")
    await app.initialization

    await browser.getButton("View").click()
    await browser.getButton("Edit song").click()
    browser.getElement("song-title").value = "Unsaved private edit"
    await browser.getElement("song-form").submit()

    assert.equal(app.state.editorMode, "idle")
    assert.equal(app.state.selectedSongBookId, null)
    assert.deepEqual(app.state.songBooks, [])
    assert.deepEqual(app.state.songs, [])
    assert.doesNotMatch(
        browser.document.body.textContent,
        /Unsaved private edit/
    )
    assert.equal(
        browser.getElement("app-status").textContent,
        "That song book is no longer available to your account."
    )
})

function bookSummary() {
    return {
        id: "book-1",
        name: "Private book",
        accessLevel: "admin",
        songCount: 1
    }
}
