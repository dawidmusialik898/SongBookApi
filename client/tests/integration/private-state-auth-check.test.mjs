import assert from "node:assert/strict"
import test from "node:test"

import { installTestBrowser } from "../helpers/testBrowser.mjs"

test("a 401 hides private data before session verification finishes", async () => {
    let sessionChecks = 0
    let songLoads = 0
    const deferredSession = createDeferred()
    const browser = installTestBrowser(
        () => {
            songLoads += 1

            if (songLoads === 1) {
                return {
                    body: [{
                        id: "song-1",
                        title: "Private song",
                        parts: []
                    }]
                }
            }

            return { body: { title: "Unauthorized" }, status: 401 }
        },
        {
            authHandler: request => {
                assert.equal(request.url, "/auth/me")
                sessionChecks += 1

                if (sessionChecks === 1) {
                    return {
                        body: {
                            isAuthenticated: true,
                            email: "owner@example.com"
                        }
                    }
                }

                return deferredSession.promise
            }
        }
    )
    const app = await import("../../src/main.js")
    await app.initialization
    assert.deepEqual(browser.getSongSummaries(), ["Private song"])

    const refresh = app.loadSongs()
    await new Promise(resolve => setImmediate(resolve))

    assert.deepEqual(app.state.songBooks, [])
    assert.equal(app.state.selectedSongBookId, null)
    assert.deepEqual(app.state.songs, [])
    assert.doesNotMatch(
        browser.document.body.textContent,
        /Private song/
    )

    deferredSession.resolve({
        body: { isAuthenticated: false, email: null }
    })
    await refresh
    assert.equal(app.state.auth.status, "anonymous")
})

function createDeferred() {
    let resolve
    const promise = new Promise(resolvePromise => {
        resolve = resolvePromise
    })

    return { promise, resolve }
}
