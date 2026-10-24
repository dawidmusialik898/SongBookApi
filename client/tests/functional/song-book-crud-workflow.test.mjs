import assert from "node:assert/strict"
import test from "node:test"

import { installTestBrowser } from "../helpers/testBrowser.mjs"

test("owner completes book, collaborator, and nested song workflows", async () => {
    let songBook = null
    let member = null
    const songs = new Map()
    const browser = installTestBrowser(
        request => {
            const songId = request.url.split("/").filter(Boolean)[1]

            if (request.method === "GET" && songId === undefined) {
                return { body: [...songs.values()] }
            }

            if (request.method === "POST" && songId === undefined) {
                const created = {
                    id: "song-1",
                    ...JSON.parse(request.body)
                }
                songs.set(created.id, created)
                return { body: created, status: 201 }
            }

            if (request.method === "GET" && songs.has(songId)) {
                return { body: songs.get(songId) }
            }

            if (request.method === "DELETE" && songs.delete(songId)) {
                return { body: null, status: 204 }
            }

            return { body: { title: "Not found" }, status: 404 }
        },
        {
            songBookHandler: request => {
                const segments = new URL(
                    request.url,
                    "https://localhost/"
                ).pathname.split("/").filter(Boolean)

                if (segments.length === 1 && request.method === "GET") {
                    return {
                        body: songBook === null
                            ? []
                            : [{
                                ...songBook,
                                songCount: songs.size
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
                        body: { ...songBook, songCount: 0 },
                        status: 201
                    }
                }

                if (segments.length === 2 && request.method === "GET") {
                    return {
                        body: {
                            ...songBook,
                            songCount: songs.size
                        }
                    }
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
                    member = {
                        id: "access-1",
                        ...JSON.parse(request.body)
                    }
                    return { body: member }
                }

                if (segments.length === 2 && request.method === "DELETE") {
                    songBook = null
                    member = null
                    songs.clear()
                    return { body: null, status: 204 }
                }

                throw new Error(
                    `Unexpected request ${request.method} ${request.url}`
                )
            }
        }
    )
    const app = await import("../../src/main.js")
    await app.initialization

    await browser.getButton("New song book").click()
    browser.getElement("song-book-name").value = "Team songs"
    await browser.getElement("song-book-form").submit()

    await browser.getButton("New song").click()
    browser.getElement("song-title").value = "Nested song"
    await browser.getElement("song-form").submit()

    assert.equal(app.state.selectedSongBookId, "book-1")
    assert.equal(app.state.selectedSongId, "song-1")
    assert.deepEqual(browser.getSongSummaries(), ["Nested song"])

    browser.getElement("song-book-access-email").value =
        "reader@example.com"
    await browser.getElement("song-book-access-form").submit()
    assert.equal(app.state.songBookMembers[0].email, "reader@example.com")

    await browser.getButtons("Delete")[0].click()
    assert.deepEqual(browser.getSongSummaries(), [])

    await browser.getButton("Delete song book").click()
    assert.equal(app.state.selectedSongBookId, null)
    assert.deepEqual(app.state.songBooks, [])

    assert.equal(
        browser.requests.every(request =>
            request.url.startsWith("/songbooks/book-1/songs")
        ),
        true
    )
})
