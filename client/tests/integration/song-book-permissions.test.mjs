import assert from "node:assert/strict"
import test from "node:test"

import { installTestBrowser } from "../helpers/testBrowser.mjs"

test("Reader, Editor, and revoked access update private UI immediately", async () => {
    let accessLevel = "reader"
    let accessible = true
    const song = {
        id: "song-1",
        title: "Private song",
        parts: []
    }
    const browser = installTestBrowser(
        request => {
            if (!accessible) {
                return {
                    body: { title: "Not found" },
                    status: 404
                }
            }

            return request.url.endsWith("/songs")
                ? { body: [song] }
                : { body: song }
        },
        {
            songBookHandler: request => {
                const segments = new URL(
                    request.url,
                    "https://localhost/"
                ).pathname.split("/").filter(Boolean)

                if (segments.length === 1) {
                    return {
                        body: accessible
                            ? [{
                                id: "book-1",
                                name: "Shared",
                                accessLevel,
                                songCount: 1
                            }]
                            : []
                    }
                }

                if (segments.length === 2) {
                    return accessible
                        ? {
                            body: {
                                id: "book-1",
                                name: "Shared",
                                accessLevel,
                                songCount: 1
                            }
                        }
                        : {
                            body: { title: "Not found" },
                            status: 404
                        }
                }

                throw new Error(
                    `Collaborators must not be loaded for ${accessLevel}`
                )
            }
        }
    )
    const app = await import("../../src/main.js")
    await app.initialization

    await browser.getButton("View").click()
    assert.equal(app.state.selectedSongBookAccessLevel, "reader")
    assert.equal(browser.getElement("new-song-button").hidden, true)
    assert.equal(browser.getButton("Edit song"), undefined)
    assert.equal(browser.getButtons("Delete").length, 0)
    assert.equal(browser.getElement("rename-song-book-button").hidden, true)
    assert.equal(browser.getElement("song-book-access-panel").hidden, true)

    accessLevel = "editor"
    await app.loadSongBooks()

    assert.equal(app.state.selectedSongBookAccessLevel, "editor")
    assert.equal(browser.getElement("new-song-button").hidden, false)
    assert.notEqual(browser.getButton("Edit song"), undefined)
    assert.equal(browser.getButtons("Delete").length, 2)
    assert.equal(browser.getElement("rename-song-book-button").hidden, true)
    assert.equal(browser.getElement("song-book-access-panel").hidden, true)

    accessible = false
    await app.loadSongs()

    assert.equal(app.state.selectedSongBookId, null)
    assert.equal(app.state.selectedSongBook, null)
    assert.deepEqual(app.state.songBooks, [])
    assert.deepEqual(app.state.songs, [])
    assert.equal(app.state.selectedSong, null)
    assert.equal(
        browser.getElement("app-status").textContent,
        "That song book is no longer available to your account."
    )
    assert.doesNotMatch(
        browser.document.body.textContent,
        /Private song/
    )
})
