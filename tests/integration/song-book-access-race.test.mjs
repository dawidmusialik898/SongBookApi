import assert from "node:assert/strict"
import test from "node:test"

import { installTestBrowser } from "../helpers/testBrowser.mjs"

test("book switching is blocked while collaborator access is saving", async () => {
    const deferredAccess = createDeferred()
    let members = []
    const books = [
        {
            id: "book-1",
            name: "One",
            accessLevel: "admin",
            songCount: 0
        },
        {
            id: "book-2",
            name: "Two",
            accessLevel: "admin",
            songCount: 0
        }
    ]
    const browser = installTestBrowser(
        () => ({ body: [] }),
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
                    return {
                        body: books.find(book => book.id === segments[1])
                    }
                }

                if (
                    segments.at(-1) === "access" &&
                    request.method === "GET"
                ) {
                    return { body: members }
                }

                if (
                    segments.at(-1) === "access" &&
                    request.method === "PUT"
                ) {
                    return deferredAccess.promise
                }

                throw new Error(
                    `Unexpected request ${request.method} ${request.url}`
                )
            }
        }
    )
    const app = await import("../../src/main.js")
    await app.initialization

    await browser.getButtons("Open")[0].click()
    browser.getElement("song-book-access-email").value =
        "reader@example.com"
    const save = browser.getElement("song-book-access-form").submit()
    await new Promise(resolve => setImmediate(resolve))

    assert.equal(app.state.isSavingSongBookAccess, true)
    assert.equal(await app.selectSongBook("book-2"), false)
    assert.equal(app.state.selectedSongBookId, "book-1")

    members = [{
        id: "access-1",
        email: "reader@example.com",
        accessLevel: "reader"
    }]
    deferredAccess.resolve({ body: members[0] })
    await save

    assert.equal(app.state.selectedSongBookId, "book-1")
    assert.deepEqual(app.state.songBookMembers, members)
})

function createDeferred() {
    let resolve
    const promise = new Promise(resolvePromise => {
        resolve = resolvePromise
    })

    return { promise, resolve }
}
