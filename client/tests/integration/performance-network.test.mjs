import assert from "node:assert/strict"
import test from "node:test"

import { installTestBrowser } from "../helpers/testBrowser.mjs"

test("book detail and songs start together, without waiting for collaborators", async () => {
    const bookResponse = deferred()
    const songsResponse = deferred()
    const membersResponse = deferred()
    const books = [
        { id: "book-a", name: "A", accessLevel: "admin", songCount: 1 },
        { id: "book-b", name: "B", accessLevel: "admin", songCount: 0 }
    ]
    const browser = installTestBrowser(
        request => {
            if (request.url === "/songs") {
                return songsResponse.promise
            }
            throw new Error(`Unexpected song request: ${request.url}`)
        },
        {
            songBookHandler: request => {
                if (request.url === "/songbooks") {
                    return { body: books }
                }
                if (request.url === "/songbooks/book-a") {
                    return bookResponse.promise
                }
                if (request.url === "/songbooks/book-a/access") {
                    return membersResponse.promise
                }
                throw new Error(`Unexpected book request: ${request.url}`)
            }
        }
    )
    const app = await import("../../src/main.js?parallel-book")
    await app.initialization

    const selection =
        browser.getElement("song-book-list").children[0].children[0].click()
    assert.ok(browser.songBookRequests.some(request =>
        request.url === "/songbooks/book-a"
    ))
    assert.ok(browser.requests.some(request =>
        request.url === "/songbooks/book-a/songs"
    ))

    bookResponse.resolve({ body: books[0] })
    songsResponse.resolve({
        body: [{ id: "song-a", title: "Song A" }]
    })
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(app.state.isLoadingSongBookMembers, true)
    assert.equal(app.state.isLoadingSongs, false)
    assert.deepEqual(browser.getSongSummaries(), ["Song A"])

    membersResponse.resolve({ body: [] })
    await selection
    assert.equal(app.state.isLoadingSongBookMembers, false)
})

test("after an edit the bounded list and full detail refetch concurrently", async () => {
    let changed = false
    const listResponse = deferred()
    const detailResponse = deferred()
    const browser = installTestBrowser(request => {
        if (request.url === "/songs" && request.method === "GET") {
            return changed
                ? listResponse.promise
                : { body: [{ id: "song-a", title: "Before" }] }
        }
        if (request.url === "/songs/song-a" &&
            request.method === "GET") {
            return changed
                ? detailResponse.promise
                : { body: { id: "song-a", title: "Before", parts: [] } }
        }
        if (request.url === "/songs/song-a" &&
            request.method === "PUT") {
            changed = true
            return { body: null, status: 204 }
        }
        throw new Error(`Unexpected song request: ${request.method} ${request.url}`)
    })
    const app = await import("../../src/main.js?parallel-save")
    await app.initialization
    await browser.getButton("View").click()
    await browser.getButton("Edit song").click()
    browser.getElement("song-title").value = "After"

    const saving = browser.getElement("song-form").submit()
    await new Promise(resolve => setImmediate(resolve))
    assert.deepEqual(
        browser.requests.map(request => request.method),
        ["GET", "GET", "PUT", "GET", "GET"]
    )
    assert.equal(app.state.isSaving, true)

    detailResponse.resolve({
        body: { id: "song-a", title: "After", parts: [] }
    })
    listResponse.resolve({
        body: [{ id: "song-a", title: "After" }]
    })
    await saving
    assert.equal(app.state.selectedSong.title, "After")
    assert.equal(app.state.isSaving, false)
})

test("superseded detail fetch is aborted without reporting a failure", async () => {
    const browser = installTestBrowser(request => {
        if (request.url === "/songs") {
            return {
                body: [
                    { id: "song-a", title: "A" },
                    { id: "song-b", title: "B" }
                ]
            }
        }
        if (request.url === "/songs/song-a") {
            return new Promise((_resolve, reject) => {
                request.signal.addEventListener("abort", () =>
                    reject(new DOMException("Aborted", "AbortError"))
                )
            })
        }
        if (request.url === "/songs/song-b") {
            return { body: { id: "song-b", title: "B", parts: [] } }
        }
        throw new Error(`Unexpected song request: ${request.url}`)
    })
    const app = await import("../../src/main.js?abort-detail")
    await app.initialization

    const first = browser.getButtons("View")[0].click()
    const firstRequest = browser.requests.at(-1)
    const second = browser.getButtons("View")[1].click()
    await Promise.all([first, second])

    assert.equal(firstRequest.signal.aborted, true)
    assert.equal(app.state.selectedSongId, "song-b")
    assert.equal(app.state.selectedSong.title, "B")
    assert.notEqual(app.state.notice?.type, "error")
})

function deferred() {
    let resolve
    const promise = new Promise(resolvePromise => {
        resolve = resolvePromise
    })
    return { promise, resolve }
}
