import assert from "node:assert/strict"
import test from "node:test"

import { createAppHarness } from "../helpers/appHarness.mjs"
import { createFakeApi } from "../helpers/fakeApi.mjs"

test("account menu reflects role, closes outside, and signs out", async () => {
    const api = createFakeApi()
    api.seed.account("owner@example.com")
    api.signIn("owner@example.com")
    const { app, browser } = createAppHarness(api)
    try {
        await app.ready
        assert.equal(
            browser.document.getElementById("account-menu").hidden,
            false
        )
        assert.equal(
            browser.document.getElementById("account-menu-button").textContent,
            "owner@example.com"
        )
        assert.equal(
            browser.document.getElementById("manage-users-link"),
            null
        )

        const menuButton = browser.document.getElementById(
            "account-menu-button"
        )
        const menuPanel = browser.document.getElementById(
            "account-menu-panel"
        )
        await menuButton.click()
        assert.equal(menuPanel.hidden, false)

        const outside = browser.document.createElement("button")
        browser.document.getElementById("screen").appendChild(outside)
        await outside.click()
        assert.equal(menuPanel.hidden, true)

        await menuButton.click()
        await browser.document.getElementById("sign-out-button").click()
        assert.equal(browser.screen(), "auth")
        assert.equal(browser.text("app-status-message"), "Signed out.")
        assert.equal(
            browser.document.getElementById("account-menu").hidden,
            true
        )
        assert.equal(api.requests.some(request =>
            request.path === "/auth/logout"
        ), true)
    } finally {
        browser.restore()
    }
})

test("moderators see the Manage users route and signed-in users do not", async () => {
    const api = createFakeApi()
    api.seed.account("moderator@example.com", { role: "moderator" })
    api.signIn("moderator@example.com")
    const { app, browser } = createAppHarness(api)
    try {
        await app.ready
        const link = browser.document.getElementById("manage-users-link")
        assert.notEqual(link, null)
        assert.equal(link.getAttribute("href"), "#/users")
        assert.match(
            browser.document.getElementById("account-menu-panel").textContent,
            /Signed in as moderator@example\.com \(Moderator\)/
        )

        await link.click()
        assert.equal(browser.location.hash, "#/users")
        assert.equal(browser.screen(), "users")
        assert.equal(
            browser.text("user-list-state"),
            "No other users."
        )
    } finally {
        browser.restore()
    }
})

test("not-found navigation updates title and focus; editor routes hide the app bar", async () => {
    const api = createFakeApi()
    api.seed.account("owner@example.com")
    const bookId = api.seed.book({
        owner: "owner@example.com",
        name: "Editor book"
    })
    api.signIn("owner@example.com")
    const { app, browser } = createAppHarness(api)
    try {
        await app.ready
        assert.equal(
            browser.document.getElementById("app-breadcrumb").textContent,
            ""
        )
        await app.navigate("#/not-a-route")
        assert.equal(browser.screen(), "not-found")
        assert.equal(
            browser.document.title,
            "Page not found · Śpiewnik SpoTkanie"
        )
        assert.equal(
            browser.document.activeElement.id,
            "screen-heading"
        )
        await browser.document.getElementById("not-found-home-link").click()
        assert.equal(browser.screen(), "library")
        assert.equal(
            browser.document.activeElement.id,
            "screen-heading"
        )

        await browser.navigate(`#/books/${bookId}/songs/new`)
        assert.equal(browser.screen(), "song-editor")
        assert.equal(
            browser.document.getElementById("song-editor-form") !== null,
            true
        )
        assert.equal(
            browser.document.getElementById("app-bar").hidden,
            true
        )
        await browser.navigate("#/")
        assert.equal(
            browser.document.getElementById("app-bar").hidden,
            false
        )

        app.context.shell.setBreadcrumb([
            { text: "Sunday Service", href: "#/books/book-1" },
            { text: "Amazing Grace" }
        ])
        const breadcrumb = browser.document.getElementById(
            "app-breadcrumb"
        ).children[0]
        assert.match(
            breadcrumb.children[0].className,
            /breadcrumb__item--nearest-ancestor/
        )
        assert.equal(
            breadcrumb.children[1].children[0]
                .getAttribute("aria-current"),
            "page"
        )
        app.context.shell.setTitle(["Amazing Grace", "Sunday Service"])
        assert.equal(
            browser.document.title,
            "Amazing Grace · Sunday Service · Śpiewnik SpoTkanie"
        )
    } finally {
        browser.restore()
    }
})

test("menu dialogs return focus to their menu and deletions focus the next heading", async () => {
    const api = createFakeApi()
    api.seed.account("owner@example.com")
    const bookId = api.seed.book({
        owner: "owner@example.com",
        name: "Sunday Service"
    })
    const songId = api.seed.song(bookId, {
        title: "Amazing Grace",
        parts: [{ text: "Amazing grace" }]
    })
    api.signIn("owner@example.com")
    const { app, browser } = createAppHarness(api, {
        initialUrl: `https://localhost/#/books/${bookId}`
    })
    try {
        await app.ready
        const bookMenuButton = browser.document.getElementById(
            "book-menu-button"
        )
        await bookMenuButton.click()
        browser.queueDialogAnswer(false)
        await browser.document.getElementById("rename-book-button").click()
        await browser.settle()
        assert.ok(
            browser.document.activeElement === bookMenuButton,
            "cancelling Rename returns focus to the book menu"
        )

        await bookMenuButton.click()
        browser.queueDialogAnswer("Evening Service")
        await browser.document.getElementById("rename-book-button").click()
        await browser.settle()
        assert.equal(browser.text("app-status-message"), "Song book renamed.")
        assert.ok(
            browser.document.activeElement === bookMenuButton,
            "renaming returns focus to the book menu"
        )

        await browser.document.getElementById("song-list")
            .children[0].children[0].click()
        assert.equal(browser.screen(), "song")
        const songMenuButton = browser.document.getElementById(
            "song-menu-button"
        )
        await songMenuButton.click()
        browser.queueDialogAnswer(false)
        await browser.document.getElementById("delete-song-button").click()
        await browser.settle()
        assert.ok(
            browser.document.activeElement === songMenuButton,
            "cancelling Delete returns focus to the song menu"
        )

        await songMenuButton.click()
        browser.queueDialogAnswer(true)
        await browser.document.getElementById("delete-song-button").click()
        await browser.settle()
        assert.equal(browser.screen(), "book")
        assert.equal(browser.text("app-status-message"), "Song deleted.")
        assert.equal(browser.document.activeElement.id, "screen-heading")
        assert.equal(api.requests.some(request =>
            request.method === "DELETE" &&
            request.path === `/songbooks/${bookId}/songs/${songId}`
        ), true)

        await browser.document.getElementById("book-menu-button").click()
        browser.queueDialogAnswer(true)
        await browser.document.getElementById("delete-book-button").click()
        await browser.settle()
        assert.equal(browser.screen(), "library")
        assert.equal(browser.text("app-status-message"), "Song book deleted.")
        assert.equal(browser.document.activeElement.id, "screen-heading")
    } finally {
        browser.restore()
    }
})
