import assert from "node:assert/strict"
import test from "node:test"

import { installTestBrowser } from "../helpers/testBrowser.mjs"

test("session failure keeps private song data hidden", async () => {
    const browser = installTestBrowser(
        () => ({
            body: [{
                id: "public-song",
                title: "Public song",
                parts: []
            }]
        }),
        {
            authHandler: request => {
                assert.equal(request.url, "/auth/me")
                return {
                    body: { title: "Unavailable" },
                    status: 503
                }
            }
        }
    )

    const app = await import("../../src/main.js")
    await app.initialization

    assert.deepEqual(browser.getSongSummaries(), [])
    assert.deepEqual(app.state.songBooks, [])
    assert.equal(app.state.auth.status, "anonymous")
    assert.match(
        browser.getElement("auth-summary").textContent,
        /Session unavailable/
    )
    assert.equal(browser.getButton("View"), undefined)
    assert.equal(browser.getElement("new-song-button").hidden, true)
    assert.equal(browser.getButtons("Delete").length, 0)
    assert.equal(browser.getElement("write-access-message").hidden, false)
    assert.equal(
        browser.getElement("song-book-list-state").textContent,
        "Sign in to load private song books."
    )
})
