import assert from "node:assert/strict"
import test from "node:test"

import { createAppHarness } from "../helpers/appHarness.mjs"
import { createFakeApi } from "../helpers/fakeApi.mjs"

function seedOwnerSongs(api) {
    api.seed.account("owner@example.com")
    const bookId = api.seed.book({
        owner: "owner@example.com",
        name: "Sunday Service"
    })
    const firstSongId = api.seed.song(bookId, {
        id: "song-first",
        title: "Amazing Grace",
        author: "John Newton",
        originalTitle: "New Britain",
        number: "1",
        key: "G",
        tempo: "120",
        parts: [{
            name: "Verse 1",
            text: "Amazing grace",
            chords: [
                { offset: 0, symbol: "G" },
                { offset: 8, symbol: "D7" }
            ]
        }]
    })
    const secondSongId = api.seed.song(bookId, {
        id: "song-second",
        title: "Be Thou My Vision",
        key: "D",
        parts: [{
            name: "Verse",
            text: "Be Thou my vision",
            chords: [{ offset: 0, symbol: "D" }]
        }]
    })
    api.signIn("owner@example.com")
    return { bookId, firstSongId, secondSongId }
}

function containsTag(root, tagName) {
    if (root.tagName === tagName.toUpperCase()) {
        return true
    }
    return Array.isArray(root.children) &&
        root.children.some(child => containsTag(child, tagName))
}

test("song screen formats metadata, chords and pager navigation", async () => {
    const api = createFakeApi()
    const { bookId, firstSongId, secondSongId } = seedOwnerSongs(api)
    const { app, browser } = createAppHarness(api)
    try {
        await app.ready
        await app.navigate(`#/books/${bookId}`)
        const firstSongLink = browser.document.getElementById(
            "song-list"
        ).children[0].children[0]
        assert.equal(
            firstSongLink.getAttribute("data-song-id"),
            firstSongId
        )
        await firstSongLink.click()

        assert.equal(browser.screen(), "song")
        assert.equal(browser.text("screen-heading"), "Amazing Grace")
        assert.equal(
            browser.document.title,
            "Amazing Grace · Sunday Service · Śpiewnik SpoTkanie"
        )
        assert.equal(
            browser.text("song-meta"),
            "John Newton · Key G · 120 · No. 1"
        )
        assert.equal(
            browser.text("song-meta-original"),
            "Original title: New Britain"
        )
        assert.equal(
            browser.document.getElementById("chords-toggle")
                .getAttribute("aria-pressed"),
            "true"
        )
        const firstPart = browser.document.getElementById(
            "song-parts"
        ).children[0]
        assert.equal(firstPart.children[0].textContent, "Verse 1")
        assert.match(firstPart.children[1].className, /chorded-text/)

        const nextLink = browser.document.getElementById("next-song-link")
        assert.equal(
            browser.document.getElementById("previous-song-link"),
            null
        )
        assert.equal(nextLink.textContent, "Be Thou My Vision ›")
        assert.equal(
            nextLink.getAttribute("aria-label"),
            "Next song: Be Thou My Vision"
        )
        assert.equal(nextLink.getAttribute("data-song-id"), secondSongId)

        await browser.document.getElementById("chords-toggle").click()
        assert.equal(
            browser.document.getElementById("chords-toggle")
                .getAttribute("aria-pressed"),
            "false"
        )
        assert.match(
            browser.document.getElementById("song-parts").children[0]
                .children[1].className,
            /song-part__text/
        )
        await nextLink.click()
        assert.equal(browser.text("screen-heading"), "Be Thou My Vision")
        assert.equal(
            browser.document.getElementById("chords-toggle")
                .getAttribute("aria-pressed"),
            "false"
        )
        const previousLink = browser.document.getElementById(
            "previous-song-link"
        )
        assert.equal(previousLink.textContent, "‹ Amazing Grace")
        assert.equal(
            previousLink.getAttribute("aria-label"),
            "Previous song: Amazing Grace"
        )
        assert.equal(browser.document.getElementById("next-song-link"), null)

        await browser.back()
        assert.equal(browser.screen(), "book")
        assert.equal(browser.location.hash, `#/books/${bookId}`)
        const firstLinkAgain = browser.document.getElementById(
            "song-list"
        ).children[0].children[0]
        await firstLinkAgain.click()
        await browser.document.body.keydown("ArrowRight")
        assert.equal(browser.text("screen-heading"), "Be Thou My Vision")
        await browser.document.body.keydown("ArrowLeft")
        assert.equal(browser.text("screen-heading"), "Amazing Grace")
        await browser.back()
        assert.equal(browser.screen(), "book")
    } finally {
        browser.restore()
    }
})

test("arrow navigation ignores text inputs, modifiers, and open menus", async () => {
    const api = createFakeApi()
    const { bookId, firstSongId } = seedOwnerSongs(api)
    const { app, browser } = createAppHarness(api)
    try {
        await app.ready
        await app.navigate(
            `#/books/${bookId}/songs/${firstSongId}`
        )
        const input = browser.document.createElement("input")
        browser.document.getElementById("screen").appendChild(input)
        input.focus()
        await input.keydown("ArrowRight")
        assert.equal(browser.text("screen-heading"), "Amazing Grace")

        await browser.document.body.keydown("ArrowRight", { ctrlKey: true })
        assert.equal(browser.text("screen-heading"), "Amazing Grace")

        await browser.document.getElementById("song-menu-button").click()
        await browser.document.body.keydown("ArrowRight")
        assert.equal(browser.text("screen-heading"), "Amazing Grace")
        const deletion = browser.document.getElementById(
            "delete-song-button"
        ).click()
        await browser.settle()
        await browser.document.body.keydown("ArrowRight")
        assert.equal(browser.text("screen-heading"), "Amazing Grace")
        await browser.document.getElementById("dialog-cancel").click()
        await deletion

        await browser.document.body.keydown("ArrowRight")
        assert.equal(browser.text("screen-heading"), "Be Thou My Vision")
    } finally {
        browser.restore()
    }
})

test("song controls are limited to editors and chord toggles require chords", async () => {
    for (const accessLevel of ["reader", "editor", "admin"]) {
        const api = createFakeApi()
        api.seed.account("owner@example.com")
        api.seed.account("member@example.com")
        const bookId = api.seed.book({
            owner: "owner@example.com",
            name: "Permissions"
        })
        const songId = api.seed.song(bookId, {
            title: "Unchorded",
            parts: [{ text: "Lyrics" }]
        })
        const email = accessLevel === "admin"
            ? "owner@example.com"
            : "member@example.com"
        if (accessLevel !== "admin") {
            api.seed.access(bookId, email, accessLevel)
        }
        api.signIn(email)
        const { app, browser } = createAppHarness(api, {
            initialUrl:
                `https://localhost/#/books/${bookId}/songs/${songId}`
        })
        try {
            await app.ready
            const canEdit = accessLevel !== "reader"
            assert.equal(
                browser.document.getElementById("edit-song-link") !== null,
                canEdit
            )
            assert.equal(
                browser.document.getElementById("song-menu-button") !== null,
                canEdit
            )
            assert.equal(
                browser.document.getElementById("delete-song-button") !== null,
                canEdit
            )
            assert.equal(
                browser.document.getElementById("chords-toggle"),
                null
            )
        } finally {
            browser.restore()
        }
    }
})

test("song deletion can be cancelled, retried after failure, and completed", async () => {
    const api = createFakeApi()
    const { bookId, firstSongId } = seedOwnerSongs(api)
    const songPath = `/songbooks/${bookId}/songs/${firstSongId}`
    const removeFailure = api.intercept(request =>
        request.path === songPath && request.method === "DELETE"
            ? { status: 500, body: null }
            : undefined
    )
    const { app, browser } = createAppHarness(api, {
        initialUrl: `https://localhost/#/books/${bookId}/songs/${firstSongId}`
    })
    try {
        await app.ready
        await browser.document.getElementById("song-menu-button").click()
        const cancelDelete = browser.document.getElementById(
            "delete-song-button"
        ).click()
        await browser.settle()
        assert.equal(browser.text("dialog-title"), "Delete song?")
        assert.equal(
            browser.text("dialog-message"),
            'Delete "Amazing Grace"? Editors can recover it from book history until the book is deleted.'
        )
        await browser.document.getElementById("dialog-cancel").click()
        await cancelDelete
        assert.equal(browser.screen(), "song")

        await browser.document.getElementById("song-menu-button").click()
        const failedDelete = browser.document.getElementById(
            "delete-song-button"
        ).click()
        await browser.settle()
        await browser.document.getElementById("dialog-confirm").click()
        await failedDelete
        assert.equal(browser.screen(), "song")
        assert.equal(
            browser.text("app-status-message"),
            "The server could not delete the song. The song remains available. Try again."
        )

        removeFailure()
        await browser.document.getElementById("song-menu-button").click()
        const successfulDelete = browser.document.getElementById(
            "delete-song-button"
        ).click()
        await browser.settle()
        await browser.document.getElementById("dialog-confirm").click()
        await successfulDelete
        assert.equal(browser.screen(), "book")
        assert.equal(browser.text("app-status-message"), "Song deleted.")
        assert.equal(browser.document.getElementById("song-list").children.length, 1)
    } finally {
        browser.restore()
    }
})

test("a missing song and a missing book produce distinct navigation messages", async () => {
    const api = createFakeApi()
    const { bookId, firstSongId } = seedOwnerSongs(api)
    api.intercept(request =>
        request.path === `/songbooks/${bookId}/songs/${firstSongId}` &&
        request.method === "GET"
            ? { status: 404, body: null }
            : undefined
    )
    const { app, browser } = createAppHarness(api, {
        initialUrl: `https://localhost/#/books/${bookId}/songs/${firstSongId}`
    })
    try {
        await app.ready
        assert.equal(browser.screen(), "book")
        assert.equal(browser.location.hash, `#/books/${bookId}`)
        assert.equal(
            browser.text("app-status-message"),
            "This song no longer exists. It may have been deleted."
        )
        assert.equal(api.requests.filter(request =>
            request.path === `/songbooks/${bookId}` &&
            request.method === "GET"
        ).length, 3)
    } finally {
        browser.restore()
    }

    const missingBookApi = createFakeApi()
    const missing = seedOwnerSongs(missingBookApi)
    missingBookApi.intercept(request =>
        request.path === `/songbooks/${missing.bookId}` &&
        request.method === "GET"
            ? { status: 404, body: null }
            : request.path ===
                `/songbooks/${missing.bookId}/songs/${missing.firstSongId}` &&
                request.method === "GET"
                ? { status: 404, body: null }
                : undefined
    )
    const missingBookHarness = createAppHarness(missingBookApi, {
        initialUrl:
            `https://localhost/#/books/${missing.bookId}/songs/${missing.firstSongId}`
    })
    try {
        await missingBookHarness.app.ready
        assert.equal(missingBookHarness.browser.screen(), "library")
        assert.equal(
            missingBookHarness.browser.text("app-status-message"),
            "That song book is no longer available to your account."
        )
    } finally {
        missingBookHarness.browser.restore()
    }
})

test("a delete 404 returns to the book as already deleted", async () => {
    const api = createFakeApi()
    const { bookId, firstSongId } = seedOwnerSongs(api)
    api.intercept(request =>
        request.path === `/songbooks/${bookId}/songs/${firstSongId}` &&
        request.method === "DELETE"
            ? { status: 404, body: null }
            : undefined
    )
    const { app, browser } = createAppHarness(api, {
        initialUrl: `https://localhost/#/books/${bookId}/songs/${firstSongId}`
    })
    try {
        await app.ready
        await browser.document.getElementById("song-menu-button").click()
        const deleting = browser.document.getElementById(
            "delete-song-button"
        ).click()
        await browser.settle()
        await browser.document.getElementById("dialog-confirm").click()
        await deleting
        assert.equal(browser.screen(), "book")
        assert.equal(
            browser.text("app-status-message"),
            "This song was already deleted."
        )
    } finally {
        browser.restore()
    }
})

test("a song mutation 403 refreshes access and hides editor controls", async () => {
    const api = createFakeApi()
    const { bookId, firstSongId } = seedOwnerSongs(api)
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
                        songCount: 2
                    }
                }
            }
        }
        if (
            request.path ===
                `/songbooks/${bookId}/songs/${firstSongId}` &&
            request.method === "DELETE"
        ) {
            return { status: 403, body: null }
        }
        return undefined
    })
    const { app, browser } = createAppHarness(api, {
        initialUrl: `https://localhost/#/books/${bookId}/songs/${firstSongId}`
    })
    try {
        await app.ready
        await browser.document.getElementById("song-menu-button").click()
        const deleting = browser.document.getElementById(
            "delete-song-button"
        ).click()
        await browser.settle()
        await browser.document.getElementById("dialog-confirm").click()
        await deleting
        assert.equal(browser.screen(), "song")
        assert.equal(browser.text("screen-heading"), "Amazing Grace")
        assert.equal(
            browser.document.getElementById("edit-song-link"),
            null
        )
        assert.equal(
            browser.document.getElementById("song-menu-button"),
            null
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

test("an adjacent-song failure hides the pager without a message", async () => {
    const api = createFakeApi()
    const { bookId, firstSongId } = seedOwnerSongs(api)
    api.intercept(request =>
        request.path ===
            `/songbooks/${bookId}/songs/${firstSongId}/adjacent` &&
        request.method === "GET"
            ? { status: 500, body: null }
            : undefined
    )
    const { app, browser } = createAppHarness(api, {
        initialUrl: `https://localhost/#/books/${bookId}/songs/${firstSongId}`
    })
    try {
        await app.ready
        assert.equal(
            browser.document.getElementById("song-pager"),
            null
        )
        assert.equal(browser.text("app-status-message"), "")
    } finally {
        browser.restore()
    }
})

test("a 401 from any book or song request ends the session and removes private data", async () => {
    for (const requestTarget of ["book", "song", "adjacent"]) {
        const api = createFakeApi()
        const { bookId, firstSongId } = seedOwnerSongs(api)
        const path = requestTarget === "book"
            ? `/songbooks/${bookId}`
            : requestTarget === "song"
                ? `/songbooks/${bookId}/songs/${firstSongId}`
                : `/songbooks/${bookId}/songs/${firstSongId}/adjacent`
        api.intercept(request =>
            request.path === path && request.method === "GET"
                ? { status: 401, body: null }
                : undefined
        )
        const initialPath = requestTarget === "book"
            ? `#/books/${bookId}`
            : `#/books/${bookId}/songs/${firstSongId}`
        const { app, browser } = createAppHarness(api, {
            initialUrl: `https://localhost/${initialPath}`
        })
        try {
            await app.ready
            assert.equal(browser.screen(), "auth")
            assert.equal(
                browser.text("app-status-message"),
                "Your session ended. Sign in to access your song books."
            )
            assert.doesNotMatch(
                browser.text("screen"),
                /Sunday Service|Amazing Grace|John Newton/
            )
            assert.equal(app.context.session.state.status, "anonymous")
        } finally {
            browser.restore()
        }
    }
})

test("song metadata omits empty values and user content is literal text", async () => {
    const api = createFakeApi()
    api.seed.account("owner@example.com")
    const bookId = api.seed.book({
        owner: "owner@example.com",
        name: "Safe rendering"
    })
    const title = '<img src=x onerror="alert(1)">'
    const songId = api.seed.song(bookId, {
        title,
        parts: [{
            name: "<script>part</script>",
            text: "<b>lyrics</b>",
            chords: []
        }]
    })
    api.signIn("owner@example.com")
    const { app, browser } = createAppHarness(api, {
        initialUrl: `https://localhost/#/books/${bookId}/songs/${songId}`
    })
    try {
        await app.ready
        assert.equal(browser.text("screen-heading"), title)
        assert.equal(browser.text("song-meta"), "")
        assert.equal(
            browser.document.getElementById("song-meta-original").hidden,
            true
        )
        assert.equal(
            browser.document.getElementById("song-parts").textContent,
            "<script>part</script><b>lyrics</b>"
        )
        assert.equal(containsTag(
            browser.document.getElementById("screen"),
            "img"
        ), false)
        assert.equal(containsTag(
            browser.document.getElementById("screen"),
            "script"
        ), false)
    } finally {
        browser.restore()
    }
})
