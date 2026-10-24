import assert from "node:assert/strict"
import test from "node:test"

import { createAppHarness } from "../helpers/appHarness.mjs"
import { createFakeApi } from "../helpers/fakeApi.mjs"

test("a private-request 401 removes the library and shows the ended-session message", async () => {
    const api = createFakeApi()
    api.seed.account("owner@example.com")
    const bookId = api.seed.book({
        owner: "owner@example.com",
        name: "Private Sunday Service"
    })
    api.seed.song(bookId, { title: "Private song" })
    api.signIn("owner@example.com")
    api.intercept(request =>
        request.path === "/songbooks"
            ? { status: 401, body: null }
            : undefined
    )
    const { app, browser } = createAppHarness(api)
    try {
        await app.ready
        assert.equal(browser.screen(), "auth")
        assert.equal(
            browser.text("app-status-message"),
            "Your session ended. Sign in to access your song books."
        )
        assert.equal(
            browser.document.getElementById("song-book-list"),
            null
        )
        assert.doesNotMatch(
            browser.text("screen"),
            /Private Sunday Service|Private song/
        )
        assert.equal(
            browser.document.getElementById("app-status")
                .getAttribute("role"),
            "alert"
        )
        assert.equal(app.context.session.state.status, "anonymous")
        assert.equal(app.context.cache.bookList, null)
    } finally {
        browser.restore()
    }
})
