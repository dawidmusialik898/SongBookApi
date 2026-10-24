import assert from "node:assert/strict"
import test from "node:test"

import { installTestBrowser } from "../helpers/testBrowser.mjs"

test("song and book selection update existing rows without scanning songs", async () => {
    const browser = installTestBrowser(() => ({ body: [] }))
    const app = await import("../../src/main.js?stable-rows")
    await app.initialization

    app.state.songs = new Proxy(
        Array.from({ length: 150 }, (_, index) => ({
            id: `song-${index}`,
            title: `Song ${index}`
        })),
        {
            get(target, key, receiver) {
                if (key === "find") {
                    throw new Error("Rendering must not search for each song")
                }
                return Reflect.get(target, key, receiver)
            }
        }
    )
    app.renderSongList()
    const firstSongRow = browser.songList.children[0]
    const lastSongRow = browser.songList.children[149]
    app.state.selectedSongId = "song-149"
    app.renderSongList()
    assert.equal(browser.songList.children[0], firstSongRow)
    assert.equal(browser.songList.children[149], lastSongRow)
    assert.equal(
        lastSongRow.children[1].children[0].getAttribute("aria-current"),
        "true"
    )

    app.state.selectedSong = {
        id: "song-149",
        title: "Updated detail",
        parts: []
    }
    app.state.isSaving = true
    app.renderSongList()
    assert.equal(browser.songList.children[149], lastSongRow)
    assert.equal(lastSongRow.children[1].children[0].disabled, true)
    assert.equal(
        lastSongRow.children[1].children[1].getAttribute("aria-label"),
        "Delete Updated detail"
    )

    app.state.songBooks = [
        { id: "book-a", name: "A", accessLevel: "admin" },
        { id: "book-b", name: "B", accessLevel: "reader" }
    ]
    app.renderSongBookList()
    const firstBookRow = browser.getElement("song-book-list").children[0]
    app.state.selectedSongBookId = "book-b"
    app.renderSongBookList()
    assert.equal(browser.getElement("song-book-list").children[0], firstBookRow)
    assert.equal(
        browser.getElement("song-book-list").children[1]
            .children[0].getAttribute("aria-current"),
        "true"
    )
})

test("moderation busy state keeps its list elements in place", async () => {
    let finishMutation
    const mutation = new Promise(resolve => {
        finishMutation = resolve
    })
    const users = [{
        id: "user-a",
        email: "user@example.test",
        role: "user",
        isBanned: false,
        emailConfirmed: true
    }]
    const browser = installTestBrowser(
        () => ({ body: [] }),
        {
            authHandler: request => {
                if (request.url === "/auth/me") {
                    return {
                        body: {
                            isAuthenticated: true,
                            email: "owner@example.test",
                            role: "superuser"
                        }
                    }
                }
                throw new Error(`Unexpected auth request: ${request.url}`)
            },
            moderationHandler: request => {
                if (request.method === "GET") {
                    return { body: users }
                }
                if (request.method === "PUT") {
                    return mutation
                }
                throw new Error(`Unexpected moderation request: ${request.url}`)
            }
        }
    )
    const app = await import("../../src/main.js?stable-users")
    await app.initialization
    await browser.getButton("Manage users").click()
    const row = browser.getElement("moderation-list").children[0]

    const banning = browser.getButton("Ban").click()
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(browser.getElement("moderation-list").children[0], row)
    assert.equal(app.state.mutatingManagedUserId, "user-a")
    assert.equal(row.children[1].children[0].disabled, true)

    users[0].isBanned = true
    finishMutation({ body: null, status: 204 })
    await banning
    assert.equal(app.state.mutatingManagedUserId, null)
    assert.ok(browser.getButton("Unban"))
})
