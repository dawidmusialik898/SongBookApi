import assert from "node:assert/strict"
import test from "node:test"

import { createAppHarness } from "../helpers/appHarness.mjs"
import { createFakeApi } from "../helpers/fakeApi.mjs"

function seedBook(api) {
    api.seed.account("owner@example.com")
    const bookId = api.seed.book({
        owner: "owner@example.com",
        name: "Race book"
    })
    const songId = api.seed.song(bookId, {
        title: "Race song",
        parts: [{ text: "Lyrics" }]
    })
    api.signIn("owner@example.com")
    return { bookId, songId }
}

test("a late book response cannot replace a later route", async () => {
    const api = createFakeApi()
    const { bookId } = seedBook(api)
    let resolveResponse
    let markStarted
    const started = new Promise(resolve => {
        markStarted = resolve
    })
    api.intercept(request => {
        if (
            request.path === `/songbooks/${bookId}` &&
            request.method === "GET"
        ) {
            markStarted()
            return new Promise(resolve => {
                resolveResponse = resolve
            })
        }
        return undefined
    })
    const { app, browser } = createAppHarness(api)
    try {
        await app.ready
        const opening = app.navigate(`#/books/${bookId}`)
        await started
        await app.navigate("#/an-unknown-route")
        resolveResponse({
            status: 200,
            body: {
                id: bookId,
                name: "Late book",
                accessLevel: "admin",
                songCount: 1
            }
        })
        await opening
        assert.equal(browser.screen(), "not-found")
        assert.equal(browser.text("screen-heading"), "Page not found")
        assert.doesNotMatch(browser.text("screen"), /Late book/)
    } finally {
        resolveResponse?.({ status: 200, body: null })
        browser.restore()
    }
})

test("a late song response cannot replace the book screen", async () => {
    const api = createFakeApi()
    const { bookId, songId } = seedBook(api)
    let resolveResponse
    let markStarted
    const started = new Promise(resolve => {
        markStarted = resolve
    })
    api.intercept(request => {
        if (
            request.path === `/songbooks/${bookId}/songs/${songId}` &&
            request.method === "GET"
        ) {
            markStarted()
            return new Promise(resolve => {
                resolveResponse = resolve
            })
        }
        return undefined
    })
    const { app, browser } = createAppHarness(api)
    try {
        await app.ready
        await app.navigate(`#/books/${bookId}`)
        const link = browser.document.getElementById(
            "song-list"
        ).children[0].children[0]
        const opening = link.click()
        await started
        await app.navigate(`#/books/${bookId}`)
        resolveResponse({
            status: 200,
            body: {
                id: songId,
                title: "Late song",
                parts: [{ text: "Late lyrics", chords: [] }]
            }
        })
        await opening
        assert.equal(browser.screen(), "book")
        assert.equal(browser.text("screen-heading"), "Race book")
        assert.equal(browser.document.getElementById("song-parts"), null)
        assert.doesNotMatch(browser.text("screen"), /Late song|Late lyrics/)
    } finally {
        resolveResponse?.({ status: 200, body: null })
        browser.restore()
    }
})

test("a late song-list response cannot populate a screen after navigation", async () => {
    const api = createFakeApi()
    const { bookId } = seedBook(api)
    let resolveResponse
    let markStarted
    const started = new Promise(resolve => {
        markStarted = resolve
    })
    api.intercept(request => {
        if (
            request.path === `/songbooks/${bookId}/songs` &&
            request.method === "GET"
        ) {
            markStarted()
            return new Promise(resolve => {
                resolveResponse = resolve
            })
        }
        return undefined
    })
    const { app, browser } = createAppHarness(api)
    try {
        await app.ready
        const opening = app.navigate(`#/books/${bookId}`)
        await started
        await app.navigate("#/another-unknown-route")
        resolveResponse({
            status: 200,
            body: {
                items: [{
                    id: "late-song",
                    title: "Late song",
                    author: null,
                    number: null
                }],
                page: 1,
                hasNext: false
            }
        })
        await opening
        assert.equal(browser.screen(), "not-found")
        assert.equal(browser.document.getElementById("song-list"), null)
        assert.doesNotMatch(browser.text("screen"), /Late song/)
    } finally {
        resolveResponse?.({ status: 200, body: null })
        browser.restore()
    }
})

test("a late private response after sign-out cannot render book data", async () => {
    const api = createFakeApi()
    const { bookId } = seedBook(api)
    let resolveResponse
    let markStarted
    const started = new Promise(resolve => {
        markStarted = resolve
    })
    api.intercept(request => {
        if (
            request.path === `/songbooks/${bookId}` &&
            request.method === "GET"
        ) {
            markStarted()
            return new Promise(resolve => {
                resolveResponse = resolve
            })
        }
        return undefined
    })
    const { app, browser } = createAppHarness(api)
    try {
        await app.ready
        const opening = app.navigate(`#/books/${bookId}`)
        await started
        await browser.document.getElementById("account-menu-button").click()
        await browser.document.getElementById("sign-out-button").click()
        assert.equal(browser.screen(), "auth")
        resolveResponse({
            status: 200,
            body: {
                id: bookId,
                name: "Private late book",
                accessLevel: "admin",
                songCount: 1
            }
        })
        await opening
        assert.equal(browser.screen(), "auth")
        assert.doesNotMatch(browser.text("screen"), /Private late book/)
        assert.equal(app.context.session.state.status, "anonymous")
    } finally {
        resolveResponse?.({ status: 200, body: null })
        browser.restore()
    }
})
