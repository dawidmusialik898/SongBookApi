import assert from "node:assert/strict"
import test from "node:test"

import { installTestBrowser } from "../helpers/testBrowser.mjs"

test("admin creates, renames, shares, and deletes a song book", async () => {
    let songBook = null
    let member = null
    const browser = installTestBrowser(
        () => ({ body: [] }),
        {
            songBookHandler: request => {
                const segments = pathSegments(request.url)

                if (segments.length === 1 && request.method === "GET") {
                    return {
                        body: songBook === null
                            ? []
                            : [{
                                ...songBook,
                                songCount: 0
                            }]
                    }
                }

                if (segments.length === 1 && request.method === "POST") {
                    songBook = {
                        id: "book-1",
                        name: JSON.parse(request.body).name,
                        accessLevel: "admin"
                    }
                    return {
                        body: {
                            ...songBook,
                            songCount: 0
                        },
                        status: 201
                    }
                }

                if (
                    segments.length === 2 &&
                    request.method === "GET"
                ) {
                    return { body: { ...songBook, songCount: 0 } }
                }

                if (
                    segments.length === 2 &&
                    request.method === "PUT"
                ) {
                    songBook.name = JSON.parse(request.body).name
                    return { body: null, status: 204 }
                }

                if (
                    segments.length === 2 &&
                    request.method === "DELETE"
                ) {
                    songBook = null
                    member = null
                    return { body: null, status: 204 }
                }

                if (
                    segments.at(-1) === "access" &&
                    request.method === "GET"
                ) {
                    return { body: member === null ? [] : [member] }
                }

                if (
                    segments.at(-1) === "access" &&
                    request.method === "PUT"
                ) {
                    const payload = JSON.parse(request.body)
                    member = {
                        id: "access-1",
                        email: payload.email,
                        accessLevel: payload.accessLevel
                    }
                    return { body: member }
                }

                if (
                    segments.at(-2) === "access" &&
                    request.method === "DELETE"
                ) {
                    member = null
                    return { body: null, status: 204 }
                }

                throw new Error(
                    `Unexpected song-book request: ` +
                    `${request.method} ${request.url}`
                )
            }
        }
    )
    const app = await import("../../src/main.js")
    await app.initialization

    assert.deepEqual(app.state.songBooks, [])
    assert.equal(
        browser.getElement("song-book-list-state").textContent,
        "No song books yet. Create the first one."
    )

    await browser.getButton("New song book").click()
    browser.getElement("song-book-name").value = "Sunday Service"
    await browser.getElement("song-book-form").submit()

    assert.equal(app.state.selectedSongBookId, "book-1")
    assert.equal(app.state.selectedSongBook.name, "Sunday Service")
    assert.equal(app.state.selectedSongBookAccessLevel, "admin")
    assert.deepEqual(
        browser.getSongBookSummaries(),
        ["Sunday Service (Admin, 0 songs)"]
    )
    assert.equal(
        browser.getElement("selected-song-book-heading").textContent,
        "Sunday Service (Admin)"
    )

    await browser.getButton("Rename").click()
    browser.getElement("song-book-name").value = "Evening Service"
    await browser.getElement("song-book-form").submit()

    assert.equal(app.state.selectedSongBook.name, "Evening Service")
    assert.deepEqual(
        browser.getSongBookSummaries(),
        ["Evening Service (Admin, 0 songs)"]
    )

    browser.getElement("song-book-access-email").value =
        "reader@example.com"
    browser.getElement("song-book-access-level").value = "reader"
    await browser.getElement("song-book-access-form").submit()

    assert.equal(app.state.songBookMembers.length, 1)
    assert.equal(app.state.songBookMembers[0].accessLevel, "reader")
    assert.match(
        browser.getElement("song-book-access-list").textContent,
        /reader@example\.com \(Reader\)/
    )

    await browser.getButton("Change").click()
    browser.getElement("song-book-access-level").value = "editor"
    await browser.getElement("song-book-access-form").submit()
    assert.equal(app.state.songBookMembers[0].accessLevel, "editor")

    await browser.getButton("Remove").click()
    assert.deepEqual(app.state.songBookMembers, [])
    assert.equal(
        browser.getElement("song-book-access-state").textContent,
        "No collaborators."
    )

    await browser.getButton("Delete song book").click()
    assert.equal(app.state.selectedSongBookId, null)
    assert.deepEqual(app.state.songBooks, [])
    assert.deepEqual(app.state.songs, [])
    assert.equal(
        browser.getElement("app-status").textContent,
        "Song book deleted."
    )
    assert.match(browser.confirmations[0], /Remove access/)
    assert.match(browser.confirmations[1], /all of its songs/)
})

function pathSegments(url) {
    return new URL(url, "https://localhost/")
        .pathname
        .split("/")
        .filter(Boolean)
        .map(decodeURIComponent)
}
