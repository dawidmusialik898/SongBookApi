import assert from "node:assert/strict"
import test from "node:test"

import { installTestBrowser } from "../helpers/testBrowser.mjs"

test("a song-detail 403 clears all cached private book data", async () => {
    let accessible = true
    const song = { id: "song-1", title: "Private", parts: [] }
    const browser = installTestBrowser(
        request => {
            if (request.url.endsWith("/songs")) {
                return { body: [song] }
            }

            accessible = false
            return {
                body: { title: "Forbidden" },
                status: 403
            }
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

                if (segments.length === 2 && accessible) {
                    return { body: bookSummary() }
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

    assert.equal(app.state.selectedSongBookId, null)
    assert.deepEqual(app.state.songBooks, [])
    assert.deepEqual(app.state.songs, [])
    assert.equal(app.state.selectedSong, null)
    assert.doesNotMatch(browser.document.body.textContent, /Private/)
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
