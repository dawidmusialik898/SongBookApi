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

test("an editor save 401 keeps a draft that the same account can restore", async () => {
    const api = createFakeApi()
    api.seed.account("owner@example.com")
    const bookId = api.seed.book({
        owner: "owner@example.com",
        name: "Draft recovery"
    })
    const songId = api.seed.song(bookId, {
        title: "Original title",
        parts: [{ name: "Verse", text: "Original lyrics" }]
    })
    api.signIn("owner@example.com")
    const failSave = api.intercept(request =>
        request.method === "PUT" &&
        request.path === `/songbooks/${bookId}/songs/${songId}`
            ? { status: 401, body: null }
            : undefined
    )
    const { app, browser } = createAppHarness(api, {
        initialUrl:
            `https://localhost/#/books/${bookId}/songs/${songId}/edit`
    })

    try {
        await app.ready
        await browser.document.getElementById("song-title")
            .input("Unsaved title")
        await browser.document.getElementById("song-editor-form").submit()

        assert.equal(browser.screen(), "auth")
        assert.equal(
            browser.text("app-status-message"),
            "Your session ended. Sign in to retry; your unsaved song data was kept."
        )
        assert.equal(
            app.context.drafts.get(`${bookId}/${songId}`).fields.title,
            "Unsaved title"
        )
        assert.equal(
            browser.document.getElementById("song-editor-form"),
            null
        )

        browser.document.getElementById("login-email").value =
            "owner@example.com"
        browser.document.getElementById("login-password").value =
            "Password123!"
        await browser.document.getElementById("login-form").submit()

        assert.equal(browser.screen(), "song-editor")
        assert.equal(
            browser.document.getElementById("draft-restored-notice")
                .hidden,
            false
        )
        assert.equal(
            browser.document.getElementById("song-title").value,
            "Unsaved title"
        )
        assert.equal(
            browser.text("app-status-message"),
            "Signed in. Your unsaved song draft was restored."
        )
    } finally {
        failSave()
        browser.restore()
    }
})

test("a different account cannot restore another account's editor draft", async () => {
    const api = createFakeApi()
    api.seed.account("owner@example.com")
    api.seed.account("editor@example.com")
    const bookId = api.seed.book({
        owner: "owner@example.com",
        name: "Account isolation"
    })
    const songId = api.seed.song(bookId, {
        title: "Server title",
        parts: [{ name: "Verse", text: "Server lyrics" }]
    })
    api.seed.access(bookId, "editor@example.com", "editor")
    api.signIn("owner@example.com")
    const failSave = api.intercept(request =>
        request.method === "PUT" &&
        request.path === `/songbooks/${bookId}/songs/${songId}`
            ? { status: 401, body: null }
            : undefined
    )
    const { app, browser } = createAppHarness(api, {
        initialUrl:
            `https://localhost/#/books/${bookId}/songs/${songId}/edit`
    })

    try {
        await app.ready
        await browser.document.getElementById("song-title")
            .input("Owner's private draft")
        await browser.document.getElementById("song-editor-form").submit()
        assert.equal(app.context.drafts.owner, "owner@example.com")

        browser.document.getElementById("login-email").value =
            "editor@example.com"
        browser.document.getElementById("login-password").value =
            "Password123!"
        await browser.document.getElementById("login-form").submit()

        assert.equal(browser.screen(), "song-editor")
        assert.equal(
            browser.document.getElementById("draft-restored-notice")
                .hidden,
            true
        )
        assert.equal(
            browser.document.getElementById("song-title").value,
            "Server title"
        )
        assert.equal(app.context.drafts.hasAny(), false)
        assert.equal(
            browser.text("app-status-message"),
            "Signed in."
        )
    } finally {
        failSave()
        browser.restore()
    }
})

test("a late editor save after an account switch does not affect the new screen", async () => {
    const api = createFakeApi()
    api.seed.account("owner@example.com")
    api.seed.account("editor@example.com")
    const bookId = api.seed.book({
        owner: "owner@example.com",
        name: "Late save"
    })
    const songId = api.seed.song(bookId, {
        title: "Server title",
        parts: [{ name: "Verse", text: "Server lyrics" }]
    })
    api.seed.access(bookId, "editor@example.com", "editor")
    api.signIn("owner@example.com")

    let releaseSave
    let markSaveStarted
    const saveStarted = new Promise(resolve => {
        markSaveStarted = resolve
    })
    const delayedSave = new Promise(resolve => {
        releaseSave = resolve
    })
    const removeDelay = api.intercept(request => {
        if (
            request.method === "PUT" &&
            request.path === `/songbooks/${bookId}/songs/${songId}`
        ) {
            markSaveStarted()
            return delayedSave
        }
        return undefined
    })
    const { app, browser } = createAppHarness(api, {
        initialUrl:
            `https://localhost/#/books/${bookId}/songs/${songId}/edit`
    })

    try {
        await app.ready
        await browser.document.getElementById("song-title")
            .input("Owner's pending save")
        const pendingSave = browser.document.getElementById(
            "song-editor-form"
        ).submit()
        await saveStarted
        assert.equal(
            browser.document.getElementById("editor-save-button").textContent,
            "Saving…"
        )

        api.signIn("editor@example.com")
        await app.context.session.load()
        await app.context.router.render({ focus: true })
        assert.equal(browser.screen(), "song-editor")
        assert.equal(
            browser.document.getElementById("song-title").value,
            "Server title"
        )
        assert.equal(app.context.drafts.hasAny(), false)

        releaseSave({ status: 204, body: null })
        await pendingSave
        assert.equal(browser.screen(), "song-editor")
        assert.equal(
            browser.document.getElementById("song-title").value,
            "Server title"
        )
        assert.equal(browser.text("app-status-message"), "")
    } finally {
        removeDelay()
        browser.restore()
    }
})
