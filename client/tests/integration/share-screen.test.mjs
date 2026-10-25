import assert from "node:assert/strict"
import test from "node:test"

import { createAppHarness } from "../helpers/appHarness.mjs"
import { createFakeApi } from "../helpers/fakeApi.mjs"

function findCollaboratorRow(browser, accessId) {
    return [...browser.document.getElementById("collaborator-list").children]
        .find(row => row.dataset.accessId === accessId)
}

test("share loads the book and collaborator list in parallel and pages collaborators", async () => {
    const api = createFakeApi()
    api.seed.account("owner@example.com")
    const bookId = api.seed.book({
        owner: "owner@example.com",
        name: "Shared Songs"
    })
    api.seed.account("reader-000@example.com")
    const firstAccessId = api.seed.access(
        bookId,
        "reader-000@example.com",
        "reader"
    )
    for (let index = 1; index < 51; index++) {
        const email = `reader-${String(index).padStart(3, "0")}@example.com`
        api.seed.account(email)
        api.seed.access(bookId, email, index % 2 === 0 ? "reader" : "editor")
    }
    api.signIn("owner@example.com")

    const expectedPaths = new Set([
        `/songbooks/${bookId}`,
        `/songbooks/${bookId}/access`
    ])
    const requestedPaths = new Set()
    let releaseRequests
    const requestsReleased = new Promise(resolve => {
        releaseRequests = resolve
    })
    api.intercept(async request => {
        if (
            request.method === "GET" &&
            expectedPaths.has(request.path)
        ) {
            requestedPaths.add(request.path)
            if (requestedPaths.size === expectedPaths.size) {
                releaseRequests()
            }
            await requestsReleased
        }
        return undefined
    })

    const { app, browser } = createAppHarness(api, {
        initialUrl: `https://localhost/#/books/${bookId}/share`
    })
    let timeout
    try {
        const completed = await Promise.race([
            app.ready.then(() => true),
            new Promise(resolve => {
                timeout = setTimeout(() => resolve(false), 1000)
            })
        ])
        clearTimeout(timeout)
        assert.equal(completed, true)
        assert.deepEqual([...requestedPaths].sort(), [...expectedPaths].sort())
        assert.equal(browser.screen(), "share")
        assert.equal(browser.text("screen-heading"), "Share")
        assert.equal(
            browser.document.title,
            "Share · Shared Songs · Śpiewnik SpoTkanie"
        )
        assert.equal(
            browser.text("app-breadcrumb"),
            "Shared SongsShare"
        )
        assert.equal(
            browser.text("share-intro"),
            "Readers can view songs and download PDFs. Editors can also add, edit, and delete songs."
        )
        assert.equal(
            browser.document.getElementById("share-email")
                .getAttribute("type"),
            "email"
        )
        assert.equal(
            browser.document.getElementById("share-email")
                .getAttribute("required"),
            ""
        )
        assert.equal(
            browser.document.getElementById("share-email")
                .getAttribute("autocomplete"),
            "off"
        )
        assert.equal(
            browser.document.getElementById("share-access-level").value,
            "reader"
        )
        assert.equal(
            browser.document.getElementById("collaborator-list")
                .children.length,
            50
        )
        const firstRow = findCollaboratorRow(browser, firstAccessId)
        assert.equal(firstRow.children[0].textContent, "reader-000@example.com")
        assert.equal(
            firstRow.children[1].children[0].textContent,
            "Access for reader-000@example.com"
        )
        assert.equal(
            firstRow.children[1].children[1]
                .getAttribute("aria-label"),
            null
        )
        assert.equal(
            firstRow.children[1].children[2]
                .getAttribute("aria-label"),
            "Remove reader-000@example.com"
        )

        await browser.document.getElementById(
            "show-more-collaborators"
        ).click()
        assert.equal(
            browser.document.getElementById("collaborator-list")
                .children.length,
            51
        )
    } finally {
        clearTimeout(timeout)
        releaseRequests()
        browser.restore()
    }
})

test("owners can add collaborators and see Reader and Editor permissions in the book", async () => {
    const api = createFakeApi()
    api.seed.account("owner@example.com")
    api.seed.account("member@example.com")
    const bookId = api.seed.book({
        owner: "owner@example.com",
        name: "Shared Songs"
    })
    api.signIn("owner@example.com")
    const owner = createAppHarness(api, {
        initialUrl: `https://localhost/#/books/${bookId}/share`
    })

    let accessId
    try {
        await owner.app.ready
        const emailInput = owner.browser.document.getElementById("share-email")
        const accessSelect = owner.browser.document.getElementById(
            "share-access-level"
        )
        await emailInput.input("member@example.com")
        accessSelect.value = "reader"
        await owner.browser.document.getElementById("share-form").submit()

        accessId = api.requests
            .filter(request =>
                request.method === "PUT" &&
                request.path === `/songbooks/${bookId}/access`
            )
            .at(-1)
            ?.body
        assert.deepEqual(accessId, {
            email: "member@example.com",
            accessLevel: "reader"
        })
        assert.equal(owner.browser.text("app-status-message"), "Access saved.")
        assert.equal(emailInput.value, "")
        assert.equal(owner.browser.document.activeElement, emailInput)
        const memberId = findCollaboratorRow(
            owner.browser,
            "access-1"
        )?.dataset.accessId
        assert.equal(memberId, "access-1")
    } finally {
        owner.browser.restore()
    }

    api.signIn("member@example.com")
    const reader = createAppHarness(api, {
        initialUrl: `https://localhost/#/books/${bookId}`
    })
    try {
        await reader.app.ready
        assert.equal(reader.browser.screen(), "book")
        assert.equal(
            reader.browser.document.getElementById("add-song-link"),
            null
        )
        assert.notEqual(
            reader.browser.document.getElementById("pdf-link"),
            null
        )
        assert.equal(
            reader.browser.document.getElementById("book-menu-button"),
            null
        )
    } finally {
        reader.browser.restore()
    }

    api.signIn("owner@example.com")
    const ownerAgain = createAppHarness(api, {
        initialUrl: `https://localhost/#/books/${bookId}/share`
    })
    try {
        await ownerAgain.app.ready
        const accessSelect = ownerAgain.browser.document.getElementById(
            `collaborator-access-access-1`
        )
        await accessSelect.change("editor")
        assert.equal(accessSelect.value, "editor")
        assert.equal(
            ownerAgain.browser.text("app-status-message"),
            "Access updated."
        )
        const updateRequest = api.requests
            .filter(request =>
                request.method === "PUT" &&
                request.path === `/songbooks/${bookId}/access`
            )
            .at(-1)
        assert.deepEqual(updateRequest.body, {
            email: "member@example.com",
            accessLevel: "editor"
        })
    } finally {
        ownerAgain.browser.restore()
    }

    api.signIn("member@example.com")
    const editor = createAppHarness(api, {
        initialUrl: `https://localhost/#/books/${bookId}`
    })
    try {
        await editor.app.ready
        assert.equal(editor.browser.screen(), "book")
        assert.notEqual(
            editor.browser.document.getElementById("add-song-link"),
            null
        )
        assert.notEqual(
            editor.browser.document.getElementById("pdf-link"),
            null
        )
        assert.equal(
            editor.browser.document.getElementById("book-menu-button"),
            null
        )
    } finally {
        editor.browser.restore()
    }
})

test("share add validation and unregistered accounts show inline errors", async () => {
    const api = createFakeApi()
    api.seed.account("owner@example.com")
    const bookId = api.seed.book({
        owner: "owner@example.com",
        name: "Shared Songs"
    })
    api.signIn("owner@example.com")
    const { app, browser } = createAppHarness(api, {
        initialUrl: `https://localhost/#/books/${bookId}/share`
    })

    try {
        await app.ready
        const emailInput = browser.document.getElementById("share-email")
        const form = browser.document.getElementById("share-form")
        await emailInput.input("not-an-email")
        await form.submit()
        assert.equal(
            browser.text("share-form-error"),
            "The collaborator access request was rejected. A valid email address is required."
        )
        assert.equal(
            browser.document.getElementById("share-form-error").hidden,
            false
        )

        await emailInput.input("unknown@example.com")
        browser.document.getElementById("share-submit").focus()
        await form.submit()
        assert.equal(
            browser.text("share-form-error"),
            "No registered account was found for that email."
        )
        assert.ok(
            browser.document.activeElement === emailInput,
            "a rejected collaborator returns focus to the email field"
        )
        assert.equal(api.requests.some(request =>
            request.path === `/songbooks/${bookId}` &&
            request.method === "GET"
        ), true)
        assert.equal(
            browser.document.getElementById("share-email").value,
            "unknown@example.com"
        )
    } finally {
        browser.restore()
    }
})

test("collaborator load failures show retry and recover", async () => {
    const api = createFakeApi()
    api.seed.account("owner@example.com")
    const bookId = api.seed.book({
        owner: "owner@example.com",
        name: "Shared Songs"
    })
    api.signIn("owner@example.com")
    let failFirstLoad = true
    api.intercept(request => {
        if (
            failFirstLoad &&
            request.path === `/songbooks/${bookId}/access` &&
            request.method === "GET"
        ) {
            failFirstLoad = false
            return { status: 503, body: null }
        }
        return undefined
    })
    const { app, browser } = createAppHarness(api, {
        initialUrl: `https://localhost/#/books/${bookId}/share`
    })

    try {
        await app.ready
        assert.match(
            browser.text("collaborator-list-state"),
            /^The server could not load collaborators\. Try again\./
        )
        await browser.document.getElementById("collaborator-list-state")
            .children.at(-1)
            .click()
        assert.equal(
            browser.text("collaborator-list-state"),
            "Not shared with anyone yet."
        )
    } finally {
        browser.restore()
    }
})

test("failed access changes restore the previous selection and show an error", async () => {
    const api = createFakeApi()
    api.seed.account("owner@example.com")
    api.seed.account("member@example.com")
    const bookId = api.seed.book({
        owner: "owner@example.com",
        name: "Shared Songs"
    })
    const accessId = api.seed.access(bookId, "member@example.com", "reader")
    api.signIn("owner@example.com")
    api.intercept(request =>
        request.path === `/songbooks/${bookId}/access` &&
        request.method === "PUT"
            ? { status: 503, body: null }
            : undefined
    )
    const { app, browser } = createAppHarness(api, {
        initialUrl: `https://localhost/#/books/${bookId}/share`
    })

    try {
        await app.ready
        const accessSelect = browser.document.getElementById(
            `collaborator-access-${accessId}`
        )
        await accessSelect.change("editor")
        assert.equal(accessSelect.value, "reader")
        assert.equal(
            browser.text("app-status-message"),
            "Could not update collaborator access. Try again."
        )
        assert.equal(accessSelect.disabled, false)
    } finally {
        browser.restore()
    }
})

test("a revoked owner role redirects from sharing after a forbidden update", async () => {
    const api = createFakeApi()
    api.seed.account("owner@example.com")
    api.seed.account("member@example.com")
    const bookId = api.seed.book({
        owner: "owner@example.com",
        name: "Shared Songs"
    })
    const accessId = api.seed.access(bookId, "member@example.com", "editor")
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
                        name: "Shared Songs",
                        accessLevel: "editor",
                        songCount: 0
                    }
                }
            }
        }
        if (
            request.path === `/songbooks/${bookId}/access` &&
            request.method === "PUT"
        ) {
            return { status: 403, body: null }
        }
        return undefined
    })
    const { app, browser } = createAppHarness(api, {
        initialUrl: `https://localhost/#/books/${bookId}/share`
    })

    try {
        await app.ready
        await browser.document.getElementById(
            `collaborator-access-${accessId}`
        ).change("reader")
        assert.equal(browser.screen(), "book")
        assert.equal(browser.location.hash, `#/books/${bookId}`)
        assert.equal(
            browser.text("app-status-message"),
            "Only the owner can manage sharing."
        )
        assert.equal(bookReads >= 3, true)
    } finally {
        browser.restore()
    }
})

test("collaborator removal asks for confirmation, can be cancelled, and succeeds", async () => {
    const api = createFakeApi()
    api.seed.account("owner@example.com")
    api.seed.account("member@example.com")
    const bookId = api.seed.book({
        owner: "owner@example.com",
        name: "Shared Songs"
    })
    const accessId = api.seed.access(bookId, "member@example.com", "reader")
    api.signIn("owner@example.com")
    const { app, browser } = createAppHarness(api, {
        initialUrl: `https://localhost/#/books/${bookId}/share`
    })

    try {
        await app.ready
        const row = findCollaboratorRow(browser, accessId)
        const removeButton = row.children[1].children[2]
        const cancelledRemoval = removeButton.click()
        await browser.settle()
        assert.equal(browser.text("dialog-title"), "Remove access?")
        assert.equal(
            browser.text("dialog-message"),
            'Remove access for "member@example.com"?'
        )
        assert.equal(
            browser.document.getElementById("dialog-confirm").textContent,
            "Remove"
        )
        await browser.document.getElementById("dialog-cancel").click()
        await cancelledRemoval
        assert.notEqual(findCollaboratorRow(browser, accessId), undefined)
        assert.equal(api.requests.some(request =>
            request.method === "DELETE" &&
            request.path === `/songbooks/${bookId}/access/${accessId}`
        ), false)

        const removal = removeButton.click()
        await browser.settle()
        await browser.document.getElementById("dialog-confirm").click()
        await removal
        assert.equal(findCollaboratorRow(browser, accessId), undefined)
        assert.equal(
            browser.text("collaborator-list-state"),
            "Not shared with anyone yet."
        )
        assert.equal(browser.text("app-status-message"), "Access removed.")
        assert.equal(api.requests.some(request =>
            request.method === "DELETE" &&
            request.path === `/songbooks/${bookId}/access/${accessId}`
        ), true)
    } finally {
        browser.restore()
    }
})

test("access changes and stale removals keep keyboard focus on the share screen", async () => {
    const api = createFakeApi()
    api.seed.account("owner@example.com")
    api.seed.account("member@example.com")
    api.seed.account("former@example.com")
    const bookId = api.seed.book({
        owner: "owner@example.com",
        name: "Shared Songs"
    })
    const memberAccessId = api.seed.access(
        bookId,
        "member@example.com",
        "reader"
    )
    const formerAccessId = api.seed.access(
        bookId,
        "former@example.com",
        "reader"
    )
    api.signIn("owner@example.com")
    const { app, browser } = createAppHarness(api, {
        initialUrl: `https://localhost/#/books/${bookId}/share`
    })

    try {
        await app.ready
        const accessSelect = browser.document.getElementById(
            `collaborator-access-${memberAccessId}`
        )
        accessSelect.focus()
        await accessSelect.change("editor")
        assert.equal(browser.text("app-status-message"), "Access updated.")
        const updatedSelect = browser.document.getElementById(
            `collaborator-access-${memberAccessId}`
        )
        assert.equal(updatedSelect.value, "editor")
        assert.ok(
            browser.document.activeElement === updatedSelect,
            "focus returns to the re-rendered access select"
        )

        api.intercept(request =>
            request.method === "DELETE" &&
            request.path === `/songbooks/${bookId}/access/${formerAccessId}`
                ? { status: 404, body: null }
                : undefined
        )
        const removeButton = findCollaboratorRow(browser, formerAccessId)
            .children[1].children[2]
        removeButton.focus()
        const removal = removeButton.click()
        await browser.settle()
        await browser.document.getElementById("dialog-confirm").click()
        await removal
        assert.equal(
            browser.text("app-status-message"),
            "That collaborator entry was already removed."
        )
        assert.equal(findCollaboratorRow(browser, formerAccessId), undefined)
        assert.equal(browser.document.activeElement.id, "share-email")
    } finally {
        browser.restore()
    }
})

test("non-owners are redirected from sharing to the book", async () => {
    for (const accessLevel of ["reader", "editor"]) {
        const api = createFakeApi()
        api.seed.account("owner@example.com")
        api.seed.account("member@example.com")
        const bookId = api.seed.book({
            owner: "owner@example.com",
            name: "Shared Songs"
        })
        api.seed.access(bookId, "member@example.com", accessLevel)
        api.signIn("member@example.com")
        const { app, browser } = createAppHarness(api, {
            initialUrl: `https://localhost/#/books/${bookId}/share`
        })

        try {
            await app.ready
            assert.equal(browser.screen(), "book")
            assert.equal(
                browser.location.hash,
                `#/books/${bookId}`
            )
            assert.equal(
                browser.text("app-status-message"),
                "Only the owner can manage sharing."
            )
            assert.equal(
                browser.document.getElementById("book-menu-button"),
                null
            )
        } finally {
            browser.restore()
        }
    }
})

test("a late collaborator save cannot modify the next screen", async () => {
    const api = createFakeApi()
    api.seed.account("owner@example.com")
    api.seed.account("member@example.com")
    const bookId = api.seed.book({
        owner: "owner@example.com",
        name: "Shared Songs"
    })
    api.signIn("owner@example.com")
    let releaseSave
    const saveGate = new Promise(resolve => {
        releaseSave = resolve
    })
    let markSaveStarted
    const saveStarted = new Promise(resolve => {
        markSaveStarted = resolve
    })
    api.intercept(async request => {
        if (
            request.path === `/songbooks/${bookId}/access` &&
            request.method === "PUT"
        ) {
            markSaveStarted()
            await saveGate
        }
        return undefined
    })
    const { app, browser } = createAppHarness(api, {
        initialUrl: `https://localhost/#/books/${bookId}/share`
    })

    try {
        await app.ready
        const emailInput = browser.document.getElementById("share-email")
        await emailInput.input("member@example.com")
        const saving = browser.document.getElementById("share-form").submit()
        await saveStarted
        await app.navigate("/")
        assert.equal(browser.screen(), "library")
        releaseSave()
        await saving
        assert.equal(browser.screen(), "library")
        assert.equal(browser.text("app-status-message"), "")
        assert.equal(
            browser.document.getElementById("share-form"),
            null
        )
    } finally {
        releaseSave()
        browser.restore()
    }
})
