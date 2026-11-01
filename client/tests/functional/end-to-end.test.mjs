import assert from "node:assert/strict"
import test from "node:test"

import { createAppHarness } from "../helpers/appHarness.mjs"
import { createFakeApi } from "../helpers/fakeApi.mjs"

async function signIn(browser, email) {
    await browser.document.getElementById("login-email").input(email)
    await browser.document.getElementById("login-password")
        .input("Password123!")
    await browser.document.getElementById("login-form").submit()
}

async function addSong(browser, { title, author, lyrics }) {
    await browser.document.getElementById("add-song-link").click()
    assert.equal(browser.screen(), "song-editor")

    await browser.document.getElementById("more-details-button").click()
    await browser.document.getElementById("song-title").input(title)
    await browser.document.getElementById("song-author").input(author)

    const partKey = browser.document.getElementById("parts-editor")
        .children[0].dataset.partKey
    await browser.document.getElementById(`part-name-${partKey}`)
        .input("Verse 1")
    await browser.document.getElementById(`part-text-${partKey}`)
        .input(lyrics)
    await browser.document.getElementById("song-editor-form").submit()

    assert.equal(browser.screen(), "song")
    assert.equal(browser.text("screen-heading"), title)
}

test("end-to-end flow creates chorded songs, shares, exports a PDF, and switches accounts", async () => {
    const api = createFakeApi()
    api.seed.account("owner@example.com")
    api.seed.account("reader@example.com")
    const { app, browser } = createAppHarness(api)

    try {
        await app.ready
        assert.equal(browser.screen(), "auth")

        await signIn(browser, "owner@example.com")
        assert.equal(browser.screen(), "library")

        browser.queueDialogAnswer("Sunday Service")
        await browser.document.getElementById("new-song-book-button").click()
        await browser.settle()
        assert.equal(browser.screen(), "book")
        assert.equal(browser.text("screen-heading"), "Sunday Service")

        const bookMatch = browser.location.hash.match(/^#\/books\/([^/?]+)/)
        assert.ok(bookMatch)
        const bookId = decodeURIComponent(bookMatch[1])
        const bookRoute = `#/books/${encodeURIComponent(bookId)}`

        await addSong(browser, {
            title: "Amazing Grace",
            author: "John Newton",
            lyrics: "[G]Amazing [D7]grace"
        })
        const chordedSongRequest = api.requests.find(request =>
            request.method === "POST" &&
            request.path === `/songbooks/${bookId}/songs`
        )
        assert.deepEqual(chordedSongRequest.body.parts, [{
            name: "Verse 1",
            text: "Amazing grace",
            chords: [
                { offset: 0, symbol: "G" },
                { offset: 8, symbol: "D7" }
            ]
        }])
        assert.match(
            browser.document.getElementById("song-parts").children[0]
                .children[1].className,
            /chorded-text/
        )

        await browser.navigate(bookRoute)
        await addSong(browser, {
            title: "Be Thou My Vision",
            author: "Eleanor Hull",
            lyrics: "Be Thou my vision"
        })

        const previousLink = browser.document.getElementById(
            "previous-song-link"
        )
        assert.equal(
            previousLink.getAttribute("aria-label"),
            "Previous song: Amazing Grace"
        )
        await previousLink.click()
        assert.equal(browser.text("screen-heading"), "Amazing Grace")

        const nextLink = browser.document.getElementById("next-song-link")
        assert.equal(
            nextLink.getAttribute("aria-label"),
            "Next song: Be Thou My Vision"
        )
        await nextLink.click()
        assert.equal(browser.text("screen-heading"), "Be Thou My Vision")

        await browser.navigate(bookRoute)
        await browser.document.getElementById("song-search").input("Amazing")
        await browser.document.getElementById("song-search-form").submit()
        assert.equal(browser.location.hash, `${bookRoute}?q=Amazing`)
        const filteredSongs = browser.document.getElementById("song-list")
            .children
        assert.equal(filteredSongs.length, 1)
        assert.match(filteredSongs[0].textContent, /Amazing Grace/)

        await browser.document.getElementById("book-menu-button").click()
        await browser.document.getElementById("share-link").click()
        assert.equal(browser.screen(), "share")
        assert.equal(
            browser.document.getElementById("share-access-level").value,
            "reader"
        )
        await browser.document.getElementById("share-email")
            .input("reader@example.com")
        await browser.document.getElementById("share-form").submit()
        assert.equal(browser.text("app-status-message"), "Access saved.")
        assert.match(
            browser.text("collaborator-list"),
            /reader@example\.com/
        )

        await browser.navigate(bookRoute)
        await browser.document.getElementById("pdf-link").click()
        assert.equal(browser.screen(), "pdfs")
        await browser.document.getElementById("new-pdf-link").click()
        assert.equal(browser.screen(), "pdf-new")
        await browser.document.getElementById("pdf-form").submit()
        assert.equal(browser.screen(), "pdfs")

        const pdfItem = browser.document.getElementById("pdf-list").children[0]
        const pdfId = pdfItem.dataset.pdfId
        assert.ok(pdfId)
        const pdfRequest = api.requests.filter(request =>
            request.method === "POST" &&
            request.path === `/songbooks/${bookId}/pdfs`
        ).at(-1)
        assert.deepEqual(pdfRequest.body, {
            includeChords: true,
            fontFamily: "lato",
            fontSize: 10,
            orientation: "portrait",
            columns: 1
        })

        await pdfItem.children.at(-1).children[0].click()
        assert.equal(browser.downloads.length, 1)
        assert.match(browser.downloads[0].filename, /\.pdf$/)
        assert.equal(api.requests.some(request =>
            request.method === "GET" &&
            request.path ===
                `/songbooks/${bookId}/pdfs/${pdfId}/download`
        ), true)

        await browser.document.getElementById("account-menu-button").click()
        await browser.document.getElementById("sign-out-button").click()
        assert.equal(browser.screen(), "auth")
        assert.equal(browser.text("app-status-message"), "Signed out.")

        await signIn(browser, "reader@example.com")
        await browser.navigate("#/")
        assert.equal(browser.screen(), "library")
        const readerBook = browser.document.getElementById("song-book-list")
            .children[0]
        assert.match(readerBook.textContent, /Shared with you \(Reader\)/)
        await readerBook.children[0].click()

        assert.equal(browser.screen(), "book")
        assert.equal(
            browser.document.getElementById("add-song-link"),
            null
        )
        assert.equal(
            browser.document.getElementById("book-menu-button"),
            null
        )
        assert.notEqual(browser.document.getElementById("pdf-link"), null)

        await browser.document.getElementById("song-list")
            .children[0].children[0].click()
        assert.equal(browser.screen(), "song")
        assert.equal(browser.text("screen-heading"), "Amazing Grace")
        assert.equal(browser.document.getElementById("edit-song-link"), null)
        assert.equal(browser.document.getElementById("delete-song-button"), null)

        await browser.document.getElementById("account-menu-button").click()
        await browser.document.getElementById("sign-out-button").click()
        assert.equal(browser.screen(), "auth")
        assert.equal(browser.text("app-status-message"), "Signed out.")

        assert.deepEqual(
            api.requests
                .filter(request => request.path === "/auth/login")
                .map(request => request.body.email),
            ["owner@example.com", "reader@example.com"]
        )
    } finally {
        browser.restore()
    }
})
