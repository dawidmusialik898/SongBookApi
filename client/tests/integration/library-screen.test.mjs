import assert from "node:assert/strict"
import test from "node:test"

import { createAppHarness } from "../helpers/appHarness.mjs"
import { createFakeApi } from "../helpers/fakeApi.mjs"

test("library lists owned and shared books with song counts and role labels", async () => {
    const api = createFakeApi()
    api.seed.account("owner@example.com")
    api.seed.account("reader@example.com")
    api.seed.account("other@example.com")
    const ownedBook = api.seed.book({
        owner: "reader@example.com",
        name: "Owned"
    })
    api.seed.song(ownedBook, { title: "One song" })
    const readerBook = api.seed.book({
        owner: "other@example.com",
        name: "Shared reader"
    })
    api.seed.access(readerBook, "reader@example.com", "reader")
    const editorBook = api.seed.book({
        owner: "other@example.com",
        name: "Shared editor"
    })
    api.seed.access(editorBook, "reader@example.com", "editor")
    api.signIn("reader@example.com")
    const { app, browser } = createAppHarness(api)
    try {
        await app.ready
        const rows = browser.document.getElementById(
            "song-book-list"
        ).children
        assert.equal(rows.length, 3)
        const rowText = rows.map(row => row.textContent)
        assert.deepEqual(rowText, [
            "Owned1 song",
            "Shared editor0 songs · Shared with you (Editor)",
            "Shared reader0 songs · Shared with you (Reader)"
        ])
        assert.equal(
            rows[0].children[0].getAttribute("href"),
            `#/books/${ownedBook}`
        )
        assert.equal(browser.text("song-book-list-state"), "")
        assert.equal(browser.text("new-song-book-button"), "New song book")
    } finally {
        browser.restore()
    }
})

test("empty libraries and show-more paging have useful states", async () => {
    const emptyApi = createFakeApi()
    emptyApi.seed.account("owner@example.com")
    emptyApi.signIn("owner@example.com")
    const empty = createAppHarness(emptyApi)
    try {
        await empty.app.ready
        assert.equal(
            empty.browser.text("song-book-list-state"),
            "No song books yet. Create your first one."
        )
        assert.equal(
            empty.browser.document.getElementById(
                "show-more-song-books"
            ).hidden,
            true
        )
    } finally {
        empty.browser.restore()
    }

    const api = createFakeApi()
    api.seed.account("owner@example.com")
    for (let index = 0; index < 55; index++) {
        api.seed.book({
            owner: "owner@example.com",
            name: `Book ${String(index).padStart(2, "0")}`
        })
    }
    api.signIn("owner@example.com")
    const harness = createAppHarness(api)
    try {
        await harness.app.ready
        const list = harness.browser.document.getElementById(
            "song-book-list"
        )
        const more = harness.browser.document.getElementById(
            "show-more-song-books"
        )
        assert.equal(list.children.length, 50)
        assert.equal(more.hidden, false)
        assert.equal(more.getAttribute("aria-label"), "Show more song books")

        await more.click()
        assert.equal(list.children.length, 55)
        assert.equal(more.hidden, true)
    } finally {
        harness.browser.restore()
    }
})

test("new song book prompts keep duplicate errors and navigate on success", async () => {
    const api = createFakeApi()
    api.seed.account("owner@example.com")
    api.seed.book({
        owner: "owner@example.com",
        name: "Existing book"
    })
    api.signIn("owner@example.com")
    const { app, browser } = createAppHarness(api)
    try {
        await app.ready
        browser.queueDialogAnswer("Existing book")
        await browser.document.getElementById("new-song-book-button").click()
        await browser.settle()
        assert.equal(
            browser.dialogs.at(-1).title,
            "New song book"
        )
        assert.equal(
            browser.text("dialog-error"),
            "You already have a song book with that name. Choose a different name."
        )
        assert.equal(
            browser.document.getElementById("app-dialog").open,
            true
        )

        await browser.document.getElementById("dialog-input")
            .input("  New book  ")
        await browser.document.getElementById("dialog-confirm").click()
        await browser.settle()
        assert.equal(browser.screen(), "not-found")
        assert.match(browser.location.hash, /^#\/books\/book-/)
        assert.equal(browser.text("app-status-message"), "Song book created.")
        assert.equal(api.requests.filter(request =>
            request.path === "/songbooks" && request.method === "POST"
        ).length, 2)
    } finally {
        browser.restore()
    }
})

test("song-book names are rendered as literal text", async () => {
    const api = createFakeApi()
    api.seed.account("owner@example.com")
    const name = '<img src=x onerror=alert(1)>'
    api.seed.book({ owner: "owner@example.com", name })
    api.signIn("owner@example.com")
    const { app, browser } = createAppHarness(api)
    try {
        await app.ready
        const link = browser.document.getElementById(
            "song-book-list"
        ).children[0].children[0]
        assert.equal(link.children[0].textContent, name)
        assert.equal(link.children[0].children[0].tagName, undefined)
    } finally {
        browser.restore()
    }
})
