import assert from "node:assert/strict"
import test from "node:test"

import { installTestBrowser } from "../helpers/testBrowser.mjs"

test("a late song-book response cannot restore data after logout", async () => {
    let authenticated = true
    const deferredBooks = createDeferred()
    const browser = installTestBrowser(
        () => ({ body: [] }),
        {
            authHandler: request => {
                if (request.url === "/auth/me") {
                    return {
                        body: {
                            isAuthenticated: authenticated,
                            email: authenticated
                                ? "owner@example.com"
                                : null
                        }
                    }
                }

                if (request.url === "/auth/logout") {
                    authenticated = false
                    return { body: null, status: 204 }
                }

                throw new Error(
                    `Unexpected auth request ${request.url}`
                )
            },
            songBookHandler: request => {
                assert.equal(request.url, "/songbooks")
                return deferredBooks.promise
            }
        }
    )
    const app = await import("../../src/main.js")

    await new Promise(resolve => setImmediate(resolve))
    assert.equal(app.state.isLoadingSongBooks, true)
    await browser.getButton("Sign out").click()

    deferredBooks.resolve({
        body: [{
            id: "private-book",
            name: "Must stay hidden",
            accessLevel: "admin",
            songCount: 0
        }]
    })
    await app.initialization

    assert.equal(app.state.auth.status, "anonymous")
    assert.deepEqual(app.state.songBooks, [])
    assert.equal(app.state.selectedSongBookId, null)
    assert.deepEqual(browser.getSongBookSummaries(), [])
    assert.doesNotMatch(
        browser.document.body.textContent,
        /Must stay hidden/
    )
})

function createDeferred() {
    let resolve
    const promise = new Promise(resolvePromise => {
        resolve = resolvePromise
    })

    return { promise, resolve }
}
