import assert from "node:assert/strict"
import test from "node:test"

import { createFakeApi } from "../helpers/fakeApi.mjs"
import { createAppHarness } from "../helpers/appHarness.mjs"

function signedInHarness(initialUrl = "https://localhost/") {
    const api = createFakeApi()
    api.seed.account("owner@example.com")
    api.seed.book({
        id: "book-1",
        owner: "owner@example.com",
        name: "Book"
    })
    api.seed.book({
        id: "a b",
        owner: "owner@example.com",
        name: "Encoded book"
    })
    api.seed.song("book-1", {
        id: "song-1",
        title: "Song"
    })
    api.signIn("owner@example.com")
    return createAppHarness(api, { initialUrl })
}

test("router matches songs/new before the song parameter route", async () => {
    const { app, browser } = signedInHarness()
    try {
        await app.ready
        await browser.navigate("#/books/book-1/songs/new")
        assert.equal(app.context.router.current.route.name, "song-new")
        assert.equal(app.context.router.current.params.bookId, "book-1")
        assert.equal(browser.screen(), "song-editor")
    } finally {
        browser.restore()
    }
})

test("router decodes route parameters and rejects malformed escapes", async () => {
    const { app, browser } = signedInHarness()
    try {
        await app.ready
        await browser.navigate("#/books/a%20b")
        assert.equal(app.context.router.current.route.name, "book")
        assert.equal(app.context.router.current.params.bookId, "a b")

        await browser.navigate("#/books/%E0%A4%A")
        assert.equal(app.context.router.current.route.name, "not-found")
        assert.equal(browser.screen(), "not-found")
    } finally {
        browser.restore()
    }
})

test("router builds encoded hashes and only reads q on book routes", async () => {
    const { app, browser } = signedInHarness(
        "https://localhost/#/books/book-1?q=hello%20world&ignored=yes"
    )
    try {
        await app.ready
        assert.equal(
            app.context.router.href(
                "book",
                { bookId: "a/b c" },
                { q: "Grace & Peace" }
            ),
            "#/books/a%2Fb%20c?q=Grace%20%26%20Peace"
        )
        assert.deepEqual(app.context.router.current.query, {
            q: "hello world"
        })

        await browser.navigate("#/users?q=ignored")
        assert.deepEqual(app.context.router.current.query, {})
    } finally {
        browser.restore()
    }
})

test("navigate pushes and replaces without creating duplicate routes", async () => {
    const { app, browser } = signedInHarness()
    try {
        await app.ready
        await app.navigate("#/not-found")
        assert.equal(browser.location.hash, "#/not-found")
        await browser.back()
        assert.equal(browser.location.hash, "")

        await app.navigate("#/books/book-1", { replace: true })
        assert.equal(browser.location.hash, "#/books/book-1")
        await browser.back()
        assert.equal(browser.location.hash, "#/books/book-1")
    } finally {
        browser.restore()
    }
})

test("goBackOr traverses when possible and replaces otherwise", async () => {
    const { app, browser } = signedInHarness()
    try {
        await app.ready
        await app.navigate("#/books/book-1")
        await app.navigate("#/books/book-1/songs/song-1")
        await app.context.router.goBackOr("#/books/book-1")
        assert.equal(browser.location.hash, "#/books/book-1")
        await browser.back()
        assert.equal(browser.location.hash, "")
    } finally {
        browser.restore()
    }

    const fallback = signedInHarness(
        "https://localhost/#/books/book-1"
    )
    try {
        await fallback.app.ready
        await fallback.app.context.router.goBackOr("#/")
        assert.equal(fallback.browser.location.hash, "#/")
        await fallback.browser.back()
        assert.equal(fallback.browser.location.hash, "#/")
    } finally {
        fallback.browser.restore()
    }
})

test("replaceQuery updates book search without rendering", async () => {
    const { app, browser } = signedInHarness(
        "https://localhost/#/books/book-1"
    )
    try {
        await app.ready
        const view = app.context.router.current.view
        const requests = app.context.session.state.generation
        const query = app.context.router.replaceQuery({
            q: "Amazing grace"
        })

        assert.equal(
            browser.location.hash,
            "#/books/book-1?q=Amazing%20grace"
        )
        assert.deepEqual(query, { q: "Amazing grace" })
        assert.equal(app.context.router.current.view, view)
        assert.equal(app.context.session.state.generation, requests)
    } finally {
        browser.restore()
    }
})
