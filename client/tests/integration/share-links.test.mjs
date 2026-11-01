import assert from "node:assert/strict"
import test from "node:test"
import { createAppHarness } from "../helpers/appHarness.mjs"
import { createFakeApi } from "../helpers/fakeApi.mjs"
import { buildHref } from "../../src/routes.js"

function setup() {
    const api = createFakeApi()
    api.seed.account("owner@example.test")
    const bookId = api.seed.book({ owner: "owner@example.test", name: "<Public songs>" })
    const firstId = api.seed.song(bookId, {
        title: "A first", parts: [{ name: "<Verse>", text: "😀 literal <script>",
            chords: [{ offset: 0, symbol: "C" }] }]
    })
    const nextId = api.seed.song(bookId, { title: "B next", author: "Find me" })
    const pdfId = api.seed.pdf(bookId, {
        fontFamily: "dejavu-sans-mono", fontSize: 14, orientation: "landscape", columns: 3
    })
    const token = api.seed.shareLink(bookId)
    return { api, bookId, firstId, nextId, pdfId, token }
}

for (const session of ["anonymous", "owner", "outage"]) {
    test(`public book/song/PDF workflows are read-only for ${session}`, async () => {
        const data = setup()
        const { api, bookId, firstId, nextId, token, pdfId } = data
        if (session === "owner") api.signIn("owner@example.test")
        if (session === "outage") api.intercept(request =>
            request.path === "/auth/me" ? { status: 503, body: null } : undefined)
        const { app, browser } = createAppHarness(api, {
            initialUrl: `https://localhost/${buildHref("shared-book", { bookId, token })}`
        })
        try {
            await app.ready
            assert.equal(browser.screen(), "shared-book")
            assert.equal(browser.text("screen-heading"), "<Public songs>")
            assert.equal(browser.text("shared-read-only"), "Shared song book - read-only")
            for (const id of ["book-history-link", "add-song-link", "book-menu-button", "share-link"])
                assert.equal(browser.document.getElementById(id), null)
            const search = browser.document.getElementById("song-search")
            search.value = "Find me"
            await browser.document.getElementById("song-search-form").submit()
            assert.equal(browser.document.getElementById("song-list").children.length, 1)
            assert.match(browser.location.hash, /\?q=Find%20me$/)
            await app.navigate(buildHref("shared-song", { bookId, token, songId: firstId }))
            assert.equal(browser.text("song-parts").includes("😀 literal <script>"), true)
            for (const id of ["copy-song-link", "song-history-link", "edit-song-link", "song-menu-button"])
                assert.equal(browser.document.getElementById(id), null)
            await browser.document.getElementById("chords-toggle").click()
            assert.equal(browser.document.getElementById("chords-toggle").getAttribute("aria-pressed"), "false")
            assert.match(browser.document.getElementById("next-song-link").getAttribute("href"), new RegExp(token))
            await browser.document.getElementById("next-song-link").click()
            assert.equal(browser.text("screen-heading"), "B next")
            assert.equal(app.context.router.current.params.songId, nextId)
            await app.navigate(buildHref("shared-pdfs", { bookId, token }))
            assert.equal(browser.document.getElementById("new-pdf-link"), null)
            assert.match(browser.text("pdf-list"), /14 pt · landscape · 3 columns/)
            const item = browser.document.getElementById("pdf-list").children[0]
            const button = item.children.at(-1).children[0]
            await button.click()
            assert.equal(browser.downloads.length, 1)
            assert.match(browser.downloads[0].filename, new RegExp(pdfId))
            assert.equal(app.context.cache.bookList, null)
            const publicRequests = api.requests.filter(request => request.path.startsWith("/shared/"))
            assert.ok(publicRequests.length >= 10)
            for (const request of publicRequests) {
                assert.equal(request.method, "GET")
                assert.equal(request.headers["x-songbook-share-token"], token)
                assert.equal(JSON.stringify(request.query).includes(token), false)
            }
            await app.navigate("#/")
            assert.equal(browser.screen(), session === "owner" ? "library" :
                session === "outage" ? "unavailable" : "auth")
        } finally { browser.restore() }
    })
}

test("public routes render without waiting for auth/me and preserve forced reset flows", async () => {
    const { api, bookId, token } = setup()
    let release
    const gate = new Promise(resolve => { release = resolve })
    api.intercept(async request => {
        if (request.path === "/auth/me") await gate
    })

    const { app, browser } = createAppHarness(api, {
        initialUrl: `https://localhost/${buildHref("shared-book", { bookId, token })}`
    })
    try {
        await app.ready
        assert.equal(browser.text("screen-heading"), "<Public songs>")
        assert.equal(app.context.session.state.status, "loading")
        app.context.auth.forceAuth = true
        app.context.auth.resetCredentials = { email: "owner@example.test", code: "reset" }
        app.context.auth.view = "reset-password"
        await app.context.router.render()
        assert.equal(browser.screen(), "auth")
        assert.match(browser.text("screen"), /password/i)
    } finally {
        release()
        await browser.settle()
        browser.restore()
    }
})

test("public lists page without populating private navigation cache and revoked links remove content", async () => {
    const { api, bookId, token } = setup()
    for (let index = 0; index < 49; index++) api.seed.song(bookId, { title: `More ${index}` })
    const { app, browser } = createAppHarness(api, {
        initialUrl: `https://localhost/${buildHref("shared-book", { bookId, token })}`
    })
    try {
        await app.ready
        assert.equal(browser.document.getElementById("song-list").children.length, 50)
        await browser.document.getElementById("show-more-songs").click()
        assert.equal(browser.document.getElementById("song-list").children.length, 51)
        api.seed.shareLink(bookId)
        await app.context.router.render()
        assert.equal(browser.text("screen-heading"), "Shared song book unavailable")
        assert.equal(browser.text("screen").includes("<Public songs>"), false)
        assert.match(browser.text("screen"), /revoked/)
        assert.equal(app.context.cache.bookList, null)
    } finally { browser.restore() }
})

test("late public responses cannot cross tokens/routes", async () => {
    const { api, bookId, token, firstId } = setup()
    let release, started
    const gate = new Promise(resolve => { release = resolve })
    const begun = new Promise(resolve => { started = resolve })
    api.intercept(async request => {
        if (request.path === `/shared/songbooks/${bookId}/songs/${firstId}`) {
            started(request)
            await gate
        }
    })

    const { app, browser } = createAppHarness(api, {
        initialUrl: `https://localhost/${buildHref("shared-book", { bookId, token })}`
    })
    try {
        await app.ready
        const pending = app.navigate(buildHref("shared-song", { bookId, token, songId: firstId }))
        const request = await begun
        await app.navigate(buildHref("shared-book", { bookId, token: "wrong" }))
        assert.equal(request.signal.aborted, true)
        release()
        await pending
        assert.equal(browser.text("screen-heading"), "Shared song book unavailable")
        assert.equal(browser.text("screen").includes("A first"), false)
        await app.navigate("#/")
        assert.equal(browser.screen(), "auth")
    } finally { release(); browser.restore() }
})

test("navigating from a public link to a private route waits for the real session result", async () => {
    const { api, bookId, token } = setup()
    api.signIn("owner@example.test")
    let release
    const gate = new Promise(resolve => { release = resolve })
    api.intercept(async request => {
        if (request.path === "/auth/me") await gate
    })
    const { app, browser } = createAppHarness(api, {
        initialUrl: `https://localhost/${buildHref("shared-book", { bookId, token })}`
    })
    try {
        await app.ready
        await app.navigate("#/")
        assert.equal(browser.screen(), "loading")
        release()
        await browser.settle()
        assert.equal(browser.screen(), "library")
    } finally { release(); browser.restore() }
})

test("late public downloads cannot survive a session-generation change and rerendering", async () => {
    const { api, bookId, token } = setup()
    let release, started
    const gate = new Promise(resolve => { release = resolve })
    const begun = new Promise(resolve => { started = resolve })
    api.intercept(async request => {
        if (request.path.endsWith("/download")) { started(request); await gate }
    })
    const { app, browser } = createAppHarness(api, {
        initialUrl: `https://localhost/${buildHref("shared-pdfs", { bookId, token })}`
    })
    try {
        await app.ready
        const button = browser.document.getElementById("pdf-list").children[0].children.at(-1).children[0]
        const pending = button.click()
        const request = await begun
        await app.context.session.ended()
        release()
        await pending
        assert.equal(request.signal.aborted, true)
        assert.equal(browser.downloads.length, 0)
        assert.equal(browser.screen(), "shared-pdfs")
    } finally { release(); browser.restore() }
})

test("late owner creation never displays its secret after leaving sharing", async () => {
    const api = createFakeApi()
    api.seed.account("owner@example.test")
    const bookId = api.seed.book({ owner: "owner@example.test", name: "Owner songs" })
    api.signIn("owner@example.test")
    let release, started
    const gate = new Promise(resolve => { release = resolve })
    const begun = new Promise(resolve => { started = resolve })
    api.intercept(async request => {
        if (request.method === "POST" && request.path.endsWith("/share-link")) {
            started(request)
            await gate
        }
    })
    const { app, browser } = createAppHarness(api, { initialUrl: `https://localhost/#/books/${bookId}/share` })
    try {
        await app.ready
        const field = browser.document.getElementById("share-link-url")
        const pending = browser.document.getElementById("enable-share-link").click()
        const request = await begun
        await app.navigate("#/")
        release()
        await pending
        assert.equal(request.signal.aborted, true)
        assert.equal(field.value, "")
        assert.equal(browser.document.getElementById("share-link-url"), null)
        assert.equal(browser.screen(), "library")
    } finally { release(); browser.restore() }
})

for (const clipboard of [true, false, "reject"]) {
    test(`owner enables/replaces/revokes once-visible link with clipboard ${clipboard}`, async () => {
        const api = createFakeApi()
        api.seed.account("owner@example.test")
        const bookId = api.seed.book({ owner: "owner@example.test", name: "Owner songs" })
        api.signIn("owner@example.test")
        const { app, browser } = createAppHarness(api, {
            initialUrl: `https://localhost/#/books/${bookId}/share`, clipboard
        })
        try {
            await app.ready
            assert.match(browser.text("share-link-state"), /disabled/)
            await browser.document.getElementById("enable-share-link").click()
            const field = browser.document.getElementById("share-link-url")
            const first = field.value
            assert.match(first, /^https:\/\/localhost\/#\/shared\/books\/book-1\/[A-Za-z0-9_-]{43}$/)
            assert.equal(field.getAttribute("readonly"), "")
            await browser.document.getElementById("copy-share-link").click()
            if (clipboard === true) assert.deepEqual(browser.clipboardWrites, [first])
            else {
                assert.equal(browser.document.activeElement, field)
                assert.equal(field.selectionEnd, first.length)
                assert.match(browser.text("app-status"), /selected/)
            }
            browser.queueDialogAnswer(false)
            await browser.document.getElementById("enable-share-link").click()
            assert.equal(field.value, first)
            browser.queueDialogAnswer(true)
            await browser.document.getElementById("enable-share-link").click()
            assert.notEqual(field.value, first)
            const replacement = field.value
            await app.navigate("#/")
            assert.equal(field.value, "")
            await app.navigate(`#/books/${bookId}/share`)
            assert.equal(browser.document.getElementById("share-link-url").value, "")
            assert.equal(browser.document.getElementById("share-link-url").hidden, true)
            assert.match(browser.text("share-link-state"), /enabled/)
            browser.queueDialogAnswer(true)
            await browser.document.getElementById("revoke-share-link").click()
            assert.match(browser.text("share-link-state"), /disabled/)
            await app.navigate(new URL(replacement).hash)
            assert.equal(browser.text("screen-heading"), "Shared song book unavailable")
        } finally { browser.restore() }
    })
}
