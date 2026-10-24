import assert from "node:assert/strict"
import test from "node:test"

import { createAppHarness } from "../helpers/appHarness.mjs"
import { createFakeApi } from "../helpers/fakeApi.mjs"

test("app shows loading while auth is pending, then shows the auth screen", async () => {
    const api = createFakeApi()
    let resolveAuth
    let markStarted
    const started = new Promise(resolve => {
        markStarted = resolve
    })
    api.intercept(request => {
        if (request.path !== "/auth/me") {
            return undefined
        }
        markStarted()
        return new Promise(resolve => {
            resolveAuth = resolve
        })
    })
    const { app, browser } = createAppHarness(api)
    try {
        assert.equal(browser.screen(), "loading")
        assert.equal(
            browser.document.getElementById("screen").children[1].textContent,
            "Loading…"
        )
        await started
        resolveAuth({
            body: { isAuthenticated: false, email: null, role: null }
        })
        await app.ready
        assert.equal(browser.screen(), "auth")
        assert.equal(browser.text("screen-heading"), "Sign in")
        assert.equal(browser.location.hash, "")
    } finally {
        browser.restore()
    }
})

test("signed-in sessions open the library", async () => {
    const api = createFakeApi()
    api.seed.account("owner@example.com")
    api.signIn("owner@example.com")
    const { app, browser } = createAppHarness(api)
    try {
        await app.ready
        assert.equal(browser.screen(), "library")
        assert.equal(browser.text("screen-heading"), "Song books")
        assert.equal(browser.document.title, "Song books · Śpiewnik SpoTkanie")
    } finally {
        browser.restore()
    }
})

test("non-401 session failures show unavailable and retry", async () => {
    const api = createFakeApi()
    const removeFailure = api.intercept(request =>
        request.path === "/auth/me"
            ? { status: 503, body: { title: "Unavailable" } }
            : undefined
    )
    const { app, browser } = createAppHarness(api)
    try {
        await app.ready
        assert.equal(browser.screen(), "unavailable")
        assert.equal(
            browser.text("screen"),
            "Can't reach SongBookCheck your connection and try again.Try again"
        )

        removeFailure()
        await browser.document.getElementById("retry-session-button").click()
        assert.equal(browser.screen(), "auth")
    } finally {
        browser.restore()
    }
})

test("anonymous sign-in keeps and renders a requested deep link", async () => {
    const api = createFakeApi()
    api.seed.account("owner@example.com")
    const { app, browser } = createAppHarness(api, {
        initialUrl: "https://localhost/#/books/deep-book"
    })
    try {
        await app.ready
        assert.equal(browser.screen(), "auth")
        assert.equal(browser.location.hash, "#/books/deep-book")
        browser.document.getElementById("login-email").value =
            "owner@example.com"
        browser.document.getElementById("login-password").value =
            "Password123!"
        await browser.document.getElementById("login-form").submit()

        assert.equal(browser.screen(), "not-found")
        assert.equal(browser.location.hash, "#/books/deep-book")
        assert.equal(browser.text("screen-heading"), "Page not found")
        assert.equal(browser.text("app-status-message"), "Signed in.")
    } finally {
        browser.restore()
    }
})
