import assert from "node:assert/strict"
import test from "node:test"

import { createAppHarness } from "../helpers/appHarness.mjs"
import { createFakeApi } from "../helpers/fakeApi.mjs"

test("book details and songs load in parallel with role-specific actions", async () => {
    const api = createFakeApi()
    api.seed.account("owner@example.com")
    const bookId = api.seed.book({
        owner: "owner@example.com",
        name: "Sunday Service"
    })
    api.seed.song(bookId, { title: "Amazing Grace" })
    api.signIn("owner@example.com")

    const expected = new Set([
        `/songbooks/${bookId}`,
        `/songbooks/${bookId}/songs`
    ])
    const requested = new Set()
    let releaseRequests
    const requestsReleased = new Promise(resolve => {
        releaseRequests = resolve
    })
    api.intercept(async request => {
        if (request.method !== "GET" || !expected.has(request.path)) {
            return undefined
        }
        requested.add(request.path)
        if (requested.size === expected.size) {
            releaseRequests()
        }
        await requestsReleased
        return undefined
    })

    const harness = createAppHarness(api, {
        initialUrl: `https://localhost/#/books/${bookId}`
    })
    let timeout
    try {
        const completed = await Promise.race([
            harness.app.ready.then(() => true),
            new Promise(resolve => {
                timeout = setTimeout(() => resolve(false), 1000)
            })
        ])
        clearTimeout(timeout)
        assert.equal(completed, true)
        assert.deepEqual([...requested].sort(), [...expected].sort())
        assert.equal(harness.browser.screen(), "book")
        assert.equal(harness.browser.text("screen-heading"), "Sunday Service")
        assert.equal(harness.browser.text("book-meta"), "1 song")
        assert.equal(
            harness.browser.document.getElementById("add-song-link")
                .textContent,
            "Add song"
        )
        assert.equal(
            harness.browser.document.getElementById("pdf-link")
                .getAttribute("aria-label"),
            "PDF exports"
        )
        assert.notEqual(
            harness.browser.document.getElementById("book-menu-button"),
            null
        )
    } finally {
        clearTimeout(timeout)
        releaseRequests()
        harness.browser.restore()
    }

    for (const accessLevel of ["reader", "editor", "admin"]) {
        const roleApi = createFakeApi()
        roleApi.seed.account("owner@example.com")
        roleApi.seed.account("member@example.com")
        const roleBookId = roleApi.seed.book({
            owner: "owner@example.com",
            name: "Shared book"
        })
        roleApi.seed.song(roleBookId, { title: "Song" })
        const email = accessLevel === "admin"
            ? "owner@example.com"
            : "member@example.com"
        if (accessLevel !== "admin") {
            roleApi.seed.access(roleBookId, email, accessLevel)
        }
        roleApi.signIn(email)
        const roleHarness = createAppHarness(roleApi, {
            initialUrl: `https://localhost/#/books/${roleBookId}`
        })
        try {
            await roleHarness.app.ready
            const canEdit = accessLevel !== "reader"
            assert.equal(
                roleHarness.browser.document.getElementById("add-song-link")
                    !== null,
                canEdit
            )
            assert.equal(
                roleHarness.browser.document.getElementById("pdf-link")
                    !== null,
                true
            )
            assert.equal(
                roleHarness.browser.document.getElementById("book-menu-button")
                    !== null,
                accessLevel === "admin"
            )
            assert.match(
                roleHarness.browser.text("book-meta"),
                accessLevel === "reader"
                    ? /Shared with you \(Reader\)/
                    : accessLevel === "editor"
                        ? /Shared with you \(Editor\)/
                        : /^1 song$/
            )
        } finally {
            roleHarness.browser.restore()
        }
    }
})

test("book search is debounced, updates q, folds Polish diacritics, and clears", async t => {
    t.mock.timers.enable({ apis: ["setTimeout"] })
    const api = createFakeApi()
    api.seed.account("owner@example.com")
    const bookId = api.seed.book({
        owner: "owner@example.com",
        name: "Search book"
    })
    api.seed.song(bookId, { title: "Ślicznie Gwiazdeczko" })
    for (let index = 0; index < 55; index++) {
        api.seed.song(bookId, {
            title: `Song ${String(index).padStart(2, "0")}`
        })
    }
    api.signIn("owner@example.com")
    const { app, browser } = createAppHarness(api, {
        initialUrl: `https://localhost/#/books/${bookId}`
    })
    try {
        await app.ready
        assert.equal(
            browser.document.getElementById("song-list").children.length,
            50
        )
        const input = browser.document.getElementById("song-search")
        const form = browser.document.getElementById("song-search-form")
        const searchRequestCount = () => api.requests.filter(request =>
            request.path === `/songbooks/${bookId}/songs` &&
            request.query.search !== undefined
        ).length

        await input.input("  slicznie  ")
        t.mock.timers.tick(299)
        assert.equal(searchRequestCount(), 0)
        t.mock.timers.tick(1)
        await browser.settle()
        assert.equal(searchRequestCount(), 1)
        assert.equal(browser.location.hash, `#/books/${bookId}?q=slicznie`)
        assert.equal(
            browser.document.getElementById("song-list").children.length,
            1
        )
        assert.equal(
            browser.document.getElementById("song-list").children[0]
                .textContent,
            "Ślicznie Gwiazdeczko"
        )
        await browser.back()
        assert.equal(
            browser.location.hash,
            `#/books/${bookId}?q=slicznie`
        )
        assert.equal(browser.screen(), "book")

        await input.input("not found")
        await form.submit()
        assert.equal(
            browser.text("song-list-state"),
            'No songs match "not found".'
        )
        assert.equal(
            browser.location.hash,
            `#/books/${bookId}?q=not%20found`
        )

        await input.input("")
        await form.submit()
        assert.equal(browser.location.hash, `#/books/${bookId}`)
        assert.equal(
            browser.document.getElementById("song-list").children.length,
            50
        )
        assert.equal(
            api.requests.at(-1).query.search,
            undefined
        )
    } finally {
        browser.restore()
    }
})

test("book route pre-fills q from the URL", async () => {
    const api = createFakeApi()
    api.seed.account("owner@example.com")
    const bookId = api.seed.book({
        owner: "owner@example.com",
        name: "Search book"
    })
    api.seed.song(bookId, { title: "Ślicznie Gwiazdeczko" })
    api.signIn("owner@example.com")
    const { app, browser } = createAppHarness(api, {
        initialUrl: `https://localhost/#/books/${bookId}?q=slicznie`
    })
    try {
        await app.ready
        assert.equal(
            browser.document.getElementById("song-search").value,
            "slicznie"
        )
        assert.equal(
            browser.document.getElementById("song-list").children.length,
            1
        )
        assert.equal(api.requests.some(request =>
            request.path === `/songbooks/${bookId}/songs` &&
            request.query.search === "slicznie"
        ), true)
    } finally {
        browser.restore()
    }
})

test("show more appends songs and Back restores the snapshot and scroll position", async () => {
    const api = createFakeApi()
    api.seed.account("owner@example.com")
    const bookId = api.seed.book({
        owner: "owner@example.com",
        name: "Large book"
    })
    for (let index = 0; index < 55; index++) {
        api.seed.song(bookId, {
            title: `Song ${String(index).padStart(2, "0")}`
        })
    }
    api.signIn("owner@example.com")
    const { app, browser } = createAppHarness(api, {
        initialUrl: `https://localhost/#/books/${bookId}`
    })
    try {
        await app.ready
        const list = browser.document.getElementById("song-list")
        await browser.document.getElementById("show-more-songs").click()
        assert.equal(list.children.length, 55)
        browser.window.scrollTo(0, 640)
        await list.children[0].children[0].click()
        assert.equal(browser.screen(), "song")

        await browser.back()
        assert.equal(browser.screen(), "book")
        assert.equal(
            browser.document.getElementById("song-list").children.length,
            55
        )
        assert.equal(browser.window.scrollY, 640)
        assert.equal(api.requests.filter(request =>
            request.path === `/songbooks/${bookId}/songs`
        ).length, 2)
    } finally {
        browser.restore()
    }
})

test("owner can rename and delete a book, while handling conflicts and cancellation", async () => {
    const api = createFakeApi()
    api.seed.account("owner@example.com")
    const bookId = api.seed.book({
        owner: "owner@example.com",
        name: "Sunday Service"
    })
    api.seed.book({
        owner: "owner@example.com",
        name: "Duplicate"
    })
    api.signIn("owner@example.com")
    const { app, browser } = createAppHarness(api, {
        initialUrl: `https://localhost/#/books/${bookId}`
    })
    try {
        await app.ready
        await browser.document.getElementById("book-menu-button").click()
        const renameAction = browser.document.getElementById(
            "rename-book-button"
        ).click()
        await browser.settle()
        assert.equal(browser.text("dialog-title"), "Rename song book")
        assert.equal(
            browser.document.getElementById("dialog-input").value,
            "Sunday Service"
        )
        await browser.document.getElementById("dialog-input")
            .input("Duplicate")
        await browser.document.getElementById("dialog-confirm").click()
        assert.equal(
            browser.text("dialog-error"),
            "You already have a song book with that name. Choose a different name."
        )
        assert.equal(browser.document.getElementById("app-dialog").open, true)

        await browser.document.getElementById("dialog-input")
            .input("Renamed book")
        await browser.document.getElementById("dialog-confirm").click()
        await renameAction
        assert.equal(browser.text("screen-heading"), "Renamed book")
        assert.equal(browser.document.title, "Renamed book · Śpiewnik SpoTkanie")
        assert.equal(
            browser.document.getElementById("app-breadcrumb").textContent,
            "Renamed book"
        )
        assert.equal(
            browser.text("app-status-message"),
            "Song book renamed."
        )

        await browser.document.getElementById("book-menu-button").click()
        const cancelDelete = browser.document.getElementById(
            "delete-book-button"
        ).click()
        await browser.settle()
        assert.equal(browser.text("dialog-title"), "Delete song book?")
        assert.equal(
            browser.text("dialog-message"),
            'Delete "Renamed book" and all of its songs and access entries? This cannot be undone.'
        )
        await browser.document.getElementById("dialog-cancel").click()
        await cancelDelete
        assert.equal(browser.screen(), "book")

        await browser.document.getElementById("book-menu-button").click()
        const deleteBook = browser.document.getElementById(
            "delete-book-button"
        ).click()
        await browser.settle()
        await browser.document.getElementById("dialog-confirm").click()
        await deleteBook
        assert.equal(browser.screen(), "library")
        assert.equal(browser.text("app-status-message"), "Song book deleted.")
        assert.equal(api.requests.some(request =>
            request.path === `/songbooks/${bookId}` &&
            request.method === "DELETE"
        ), true)
    } finally {
        browser.restore()
    }
})

test("book 403 and 404 navigate to the library with a lost-access message", async () => {
    for (const status of [403, 404]) {
        const api = createFakeApi()
        api.seed.account("owner@example.com")
        const bookId = api.seed.book({
            owner: "owner@example.com",
            name: "Unavailable"
        })
        api.signIn("owner@example.com")
        api.intercept(request =>
            request.path === `/songbooks/${bookId}` &&
            request.method === "GET"
                ? { status, body: null }
                : undefined
        )
        const { app, browser } = createAppHarness(api, {
            initialUrl: `https://localhost/#/books/${bookId}`
        })
        try {
            await app.ready
            assert.equal(browser.screen(), "library")
            assert.equal(browser.location.hash, "#/")
            assert.equal(
                browser.text("app-status-message"),
                "That song book is no longer available to your account."
            )
        } finally {
            browser.restore()
        }
    }
})

test("a book mutation 403 refreshes the role and hides owner actions", async () => {
    const api = createFakeApi()
    api.seed.account("owner@example.com")
    const bookId = api.seed.book({
        owner: "owner@example.com",
        name: "Sunday Service"
    })
    api.signIn("owner@example.com")
    let bookReads = 0
    api.intercept(request => {
        if (
            request.path === `/songbooks/${bookId}` &&
            request.method === "GET"
        ) {
            bookReads += 1
            if (bookReads > 1) {
                return {
                    status: 200,
                    body: {
                        id: bookId,
                        name: "Sunday Service",
                        accessLevel: "reader",
                        songCount: 0
                    }
                }
            }
        }
        if (
            request.path === `/songbooks/${bookId}` &&
            request.method === "PUT"
        ) {
            return { status: 403, body: null }
        }
        return undefined
    })
    const { app, browser } = createAppHarness(api, {
        initialUrl: `https://localhost/#/books/${bookId}`
    })
    try {
        await app.ready
        await browser.document.getElementById("book-menu-button").click()
        const renameAction = browser.document.getElementById(
            "rename-book-button"
        ).click()
        await browser.settle()
        await browser.document.getElementById("dialog-input")
            .input("Changed")
        await browser.document.getElementById("dialog-confirm").click()
        await renameAction
        assert.equal(browser.screen(), "book")
        assert.equal(
            browser.document.getElementById("book-menu-button"),
            null
        )
        assert.equal(
            browser.text("book-meta"),
            "0 songs · Shared with you (Reader)"
        )
        assert.equal(
            browser.text("app-status-message"),
            "Your account is not allowed to make this change."
        )
        assert.equal(bookReads, 3)
    } finally {
        browser.restore()
    }
})

test("a book deletion 404 returns to the library as lost access", async () => {
    const api = createFakeApi()
    api.seed.account("owner@example.com")
    const bookId = api.seed.book({
        owner: "owner@example.com",
        name: "Deleted book"
    })
    api.signIn("owner@example.com")
    api.intercept(request =>
        request.path === `/songbooks/${bookId}` &&
        request.method === "DELETE"
            ? { status: 404, body: null }
            : undefined
    )
    const { app, browser } = createAppHarness(api, {
        initialUrl: `https://localhost/#/books/${bookId}`
    })
    try {
        await app.ready
        await browser.document.getElementById("book-menu-button").click()
        const deleting = browser.document.getElementById(
            "delete-book-button"
        ).click()
        await browser.settle()
        await browser.document.getElementById("dialog-confirm").click()
        await deleting
        assert.equal(browser.screen(), "library")
        assert.equal(app.context.cache.bookList, null)
        assert.equal(
            browser.text("app-status-message"),
            "That song book is no longer available to your account."
        )
    } finally {
        browser.restore()
    }
})
