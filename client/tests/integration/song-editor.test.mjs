import assert from "node:assert/strict"
import test from "node:test"

import { getSong, updateSong } from "../../src/songsApi.js"
import { createDraftKey } from "../../src/drafts.js"
import { createAppHarness } from "../helpers/appHarness.mjs"
import { createFakeApi } from "../helpers/fakeApi.mjs"

function findElement(root, predicate) {
    if (root === null || root === undefined) {
        return null
    }
    if (predicate(root)) {
        return root
    }
    for (const child of root.children ?? []) {
        const match = findElement(child, predicate)
        if (match !== null) {
            return match
        }
    }
    return null
}

function partField(browser, partKey, field) {
    return browser.document.getElementById(`part-${field}-${partKey}`)
}

test("409 retains form and draft revision across navigation; reload requires confirmation", async () => {
    const api = createFakeApi()
    api.seed.account("owner@example.com")
    const bookId = api.seed.book({ owner: "owner@example.com", name: "Concurrency" })
    const songId = api.seed.song(bookId, { title: "Original", parts: [{ name: "Verse", text: "old" }] })
    api.signIn("owner@example.com")
    const { app, browser } = createAppHarness(api, { initialUrl: `https://localhost/#/books/${bookId}/songs/${songId}/edit` })
    try {
        await app.ready
        await browser.document.getElementById("song-title").input("My kept draft")
        await updateSong(bookId, songId, { title: "Someone else's edit", parts: [], expectedRevision: 0 })
        await browser.document.getElementById("song-editor-form").submit()
        assert.equal(browser.document.getElementById("song-title").value, "My kept draft")
        assert.match(browser.text("editor-status"), /changed.*draft was kept/i)
        assert.equal(app.context.drafts.get(createDraftKey(bookId, songId)).expectedRevision, 0)
        assert.equal(browser.document.getElementById("compare-song-history").getAttribute("href"),
            `#/books/${bookId}/songs/${songId}/history`)
        await app.navigate(`#/books/${bookId}/songs/${songId}/history`)
        await app.navigate(`#/books/${bookId}/songs/${songId}/edit`)
        assert.equal(browser.document.getElementById("song-title").value, "My kept draft")
        await browser.document.getElementById("song-editor-form").submit()
        assert.equal(api.requests.filter(request => request.method === "PUT").at(-1).body.expectedRevision, 0)
        const cancelReload = browser.document.getElementById("reload-conflicted-song").click()
        await browser.settle()
        await browser.document.getElementById("dialog-cancel").click()
        await cancelReload
        assert.equal(browser.document.getElementById("song-title").value, "My kept draft")
        const reload = browser.document.getElementById("reload-conflicted-song").click()
        await browser.settle()
        await browser.document.getElementById("dialog-confirm").click()
        await reload
        assert.equal(browser.document.getElementById("song-title").value, "Someone else's edit")
        assert.equal(app.context.drafts.hasAny(), false)
        await browser.document.getElementById("song-title").input("Reconciled")
        await browser.document.getElementById("song-editor-form").submit()
        assert.equal(browser.screen(), "song")
        assert.equal((await getSong(bookId, songId)).title, "Reconciled")
        assert.equal(api.requests.filter(request => request.method === "PUT").at(-1).body.expectedRevision, 2)
    } finally { browser.restore() }
})

test("create screen saves inline chords and opens the created song", async () => {
    const api = createFakeApi()
    api.seed.account("owner@example.com")
    const bookId = api.seed.book({
        owner: "owner@example.com",
        name: "Sunday Service"
    })
    api.signIn("owner@example.com")
    const { app, browser } = createAppHarness(api, {
        initialUrl:
            `https://localhost/#/books/${bookId}/songs/new`
    })

    try {
        await app.ready
        assert.equal(browser.screen(), "song-editor")
        assert.equal(
            browser.document.getElementById("app-bar").hidden,
            true
        )
        assert.equal(browser.text("screen-heading"), "New song")
        assert.equal(
            browser.document.activeElement,
            browser.document.getElementById("song-title")
        )
        assert.equal(
            browser.document.getElementById("more-details").hidden,
            true
        )
        assert.equal(
            browser.text("chord-hint"),
            "Put chords in square brackets right before the syllable: " +
                "[Am]Amazing [D7]grace. Type \\[ for a literal bracket."
        )

        await browser.document.getElementById(
            "more-details-button"
        ).click()
        assert.equal(
            browser.document.getElementById("more-details")
                .hidden,
            false
        )
        await browser.document.getElementById("song-title")
            .input("Amazing Grace")
        await browser.document.getElementById("song-author")
            .input("John Newton")

        const partKey = browser.document.getElementById("parts-editor")
            .children[0].dataset.partKey
        assert.equal(
            partField(browser, partKey, "name").getAttribute("placeholder"),
            "e.g. Verse 1"
        )
        await partField(browser, partKey, "name").input("Verse 1")
        const textarea = partField(browser, partKey, "text")
        await textarea.input("[G]Amazing [D7]grace")
        assert.equal(textarea.getAttribute("rows"), "4")

        await browser.document.getElementById(
            "song-editor-form"
        ).submit()

        assert.equal(browser.screen(), "song")
        assert.equal(browser.text("screen-heading"), "Amazing Grace")
        assert.equal(browser.text("app-status-message"), "Song created.")
        const createRequest = api.requests.find(request =>
            request.method === "POST" &&
            request.path === `/songbooks/${bookId}/songs`
        )
        assert.deepEqual(createRequest.body.parts, [{
            name: "Verse 1",
            text: "Amazing grace",
            chords: [
                { offset: 0, symbol: "G" },
                { offset: 8, symbol: "D7" }
            ]
        }])
        assert.equal(
            browser.document.getElementById("song-parts")
                .children[0].children[1].className,
            "chorded-text"
        )
    } finally {
        browser.restore()
    }
})

test("editing an existing song sends unchanged part IDs, text, and chords", async () => {
    const api = createFakeApi()
    api.seed.account("owner@example.com")
    const bookId = api.seed.book({
        owner: "owner@example.com",
        name: "Sunday Service"
    })
    const songId = api.seed.song(bookId, {
        title: "Amazing Grace",
        author: "John Newton",
        parts: [{
            name: "Verse 1",
            text: "Amazing grace",
            chords: [
                { offset: 0, symbol: "G" },
                { offset: 8, symbol: "D7" }
            ]
        }]
    })
    api.signIn("owner@example.com")
    const { app, browser } = createAppHarness(api, {
        initialUrl:
            `https://localhost/#/books/${bookId}/songs/${songId}/edit`
    })

    try {
        await app.ready
        const original = await getSong(bookId, songId)
        assert.equal(
            browser.document.getElementById("more-details").hidden,
            false
        )
        assert.equal(
            browser.document.getElementById("more-details-button")
                .getAttribute("aria-expanded"),
            "true"
        )
        await browser.document.getElementById(
            "song-editor-form"
        ).submit()

        const updateRequest = api.requests.find(request =>
            request.method === "PUT" &&
            request.path === `/songbooks/${bookId}/songs/${songId}`
        )
        assert.deepEqual(updateRequest.body.parts, original.parts.map(part => ({
            id: part.id,
            name: part.name,
            text: part.text,
            chords: part.chords
        })))
        assert.equal(browser.screen(), "song")
        assert.equal(browser.text("app-status-message"), "Song saved.")
        assert.equal(browser.text("screen-heading"), "Amazing Grace")
    } finally {
        browser.restore()
    }
})

test("simplified legacy chord symbols show a warning without blocking save", async () => {
    const api = createFakeApi()
    api.seed.account("owner@example.com")
    const bookId = api.seed.book({
        owner: "owner@example.com",
        name: "Legacy chords"
    })
    const songId = api.seed.song(bookId, {
        title: "Legacy song",
        parts: [{
            name: "Verse",
            text: "Amazing",
            chords: [{ offset: 0, symbol: "G]" }]
        }]
    })
    api.signIn("owner@example.com")
    const { app, browser } = createAppHarness(api, {
        initialUrl:
            `https://localhost/#/books/${bookId}/songs/${songId}/edit`
    })

    try {
        await app.ready
        const partKey = browser.document.getElementById("parts-editor")
            .children[0].dataset.partKey
        assert.equal(
            browser.text(`part-error-${partKey}`),
            "Some chord symbols contained brackets and were simplified."
        )
        await browser.document.getElementById(
            "song-editor-form"
        ).submit()

        assert.equal(browser.screen(), "song")
        const updateRequest = api.requests.find(request =>
            request.method === "PUT" &&
            request.path === `/songbooks/${bookId}/songs/${songId}`
        )
        assert.deepEqual(updateRequest.body.parts[0].chords, [
            { offset: 0, symbol: "G" }
        ])
        assert.equal(browser.text("app-status-message"), "Song saved.")
    } finally {
        browser.restore()
    }
})

test("notation errors block saving and part actions preserve order and focus", async () => {
    const api = createFakeApi()
    api.seed.account("owner@example.com")
    const bookId = api.seed.book({
        owner: "owner@example.com",
        name: "Parts"
    })
    api.signIn("owner@example.com")
    const { app, browser } = createAppHarness(api, {
        initialUrl:
            `https://localhost/#/books/${bookId}/songs/new`
    })

    try {
        await app.ready
        const parts = browser.document.getElementById("parts-editor")
        const firstKey = parts.children[0].dataset.partKey
        const firstTextarea = partField(browser, firstKey, "text")
        await firstTextarea.input("[G")
        await browser.document.getElementById(
            "song-editor-form"
        ).submit()

        assert.equal(
            browser.text(`part-error-${firstKey}`),
            'Line 1: Missing "]" after "[".'
        )
        assert.equal(
            browser.text("editor-status"),
            "Fix the chord brackets marked below."
        )
        assert.equal(browser.document.activeElement, firstTextarea)
        assert.equal(
            api.requests.some(request => request.method === "POST"),
            false
        )

        await browser.document.getElementById("add-part-button").click()
        assert.equal(parts.children.length, 2)
        const secondKey = parts.children[1].dataset.partKey
        assert.equal(
            browser.document.activeElement,
            partField(browser, secondKey, "name")
        )
        await partField(browser, secondKey, "text")
            .input("one\ntwo\nthree\nfour")
        assert.equal(
            partField(browser, secondKey, "text").getAttribute("rows"),
            "5"
        )

        const firstPanel = browser.document.getElementById(
            `part-menu-${firstKey}`
        )
        assert.equal(
            findElement(firstPanel, element =>
                element.dataset?.action === "move-part-up"
            ),
            null
        )
        assert.equal(
                findElement(
                    browser.document.getElementById(`part-menu-${secondKey}`),
                    element => element.dataset?.action === "move-part-down"
                ),
                null
        )
        const secondMenuButton = browser.document.getElementById(
            `part-menu-button-${secondKey}`
        )
        await secondMenuButton.click()
        const moveUp = findElement(
            browser.document.getElementById(`part-menu-${secondKey}`),
            element => element.dataset?.action === "move-part-up"
        )
        await moveUp.click()
        assert.deepEqual(
            parts.children.map(fieldset => fieldset.dataset.partKey),
            [secondKey, firstKey]
        )
        assert.equal(
            browser.document.activeElement,
            partField(browser, secondKey, "name")
        )

        await browser.document.getElementById(
            `part-menu-button-${secondKey}`
        ).click()
        const remove = findElement(
            browser.document.getElementById(`part-menu-${secondKey}`),
            element => element.dataset?.action === "remove-part"
        )
        await remove.click()
        assert.deepEqual(
            parts.children.map(fieldset => fieldset.dataset.partKey),
            [firstKey]
        )
        await browser.document.getElementById(
            "more-details-button"
        ).click()
        assert.equal(
            browser.document.getElementById("more-details-button")
                .getAttribute("aria-expanded"),
            "true"
        )
    } finally {
        browser.restore()
    }
})

test("cancel confirms before discarding dirty changes and returns immediately when clean", async () => {
    const api = createFakeApi()
    api.seed.account("owner@example.com")
    const bookId = api.seed.book({
        owner: "owner@example.com",
        name: "Cancel"
    })
    api.signIn("owner@example.com")
    const { app, browser } = createAppHarness(api, {
        initialUrl:
            `https://localhost/#/books/${bookId}/songs/new`
    })

    try {
        await app.ready
        await browser.document.getElementById(
            "editor-cancel-button"
        ).click()
        assert.equal(browser.screen(), "book")
        await app.navigate(`#/books/${bookId}/songs/new`)
        await browser.document.getElementById("song-title")
            .input("Unsaved title")

        const keepEditing = browser.document.getElementById(
            "editor-cancel-button"
        ).click()
        await browser.settle()
        assert.equal(browser.text("dialog-title"), "Discard changes?")
        assert.equal(
            browser.text("dialog-message"),
            "Your unsaved changes will be lost."
        )
        assert.equal(
            browser.text("dialog-confirm"),
            "Discard changes"
        )
        await browser.document.getElementById("dialog-cancel").click()
        await keepEditing
        assert.equal(browser.screen(), "song-editor")

        const discard = browser.document.getElementById(
            "editor-cancel-button"
        ).click()
        await browser.settle()
        await browser.document.getElementById("dialog-confirm").click()
        await discard
        assert.equal(browser.screen(), "book")
        assert.equal(app.context.drafts.hasAny(), false)
    } finally {
        browser.restore()
    }
})

test("leaving dirty keeps a restorable draft with a continue-editing action", async () => {
    const api = createFakeApi()
    api.seed.account("owner@example.com")
    const bookId = api.seed.book({
        owner: "owner@example.com",
        name: "Drafts"
    })
    api.signIn("owner@example.com")
    const { app, browser } = createAppHarness(api, {
        initialUrl:
            `https://localhost/#/books/${bookId}/songs/new`
    })

    try {
        await app.ready
        const cleanUnload = await browser.window.dispatch("beforeunload")
        assert.equal(cleanUnload.defaultPrevented, false)
        await browser.document.getElementById("song-title")
            .input("Unsaved verse")
        const dirtyUnload = await browser.window.dispatch("beforeunload")
        assert.equal(dirtyUnload.defaultPrevented, true)
        const partKey = browser.document.getElementById("parts-editor")
            .children[0].dataset.partKey
        await partField(browser, partKey, "name").input("Verse")
        await partField(browser, partKey, "text").input("[G]Amazing")

        await app.navigate(`#/books/${bookId}`)
        assert.equal(browser.screen(), "book")
        assert.equal(
            browser.text("app-status-message"),
            'Unsaved changes to "Unsaved verse" were kept.'
        )
        assert.equal(
            browser.text("app-status-action"),
            "Continue editing"
        )
        assert.equal(
            browser.document.getElementById("app-status-action")
                .getAttribute("href"),
            `#/books/${bookId}/songs/new`
        )
        assert.equal(
            app.context.drafts.get(createDraftKey(bookId)).fields.title,
            "Unsaved verse"
        )

        await app.navigate(`#/books/${bookId}/songs/new`)
        assert.equal(browser.screen(), "song-editor")
        assert.equal(
            browser.document.getElementById("draft-restored-notice")
                .hidden,
            false
        )
        assert.equal(
            browser.text("draft-restored-notice"),
            "Restored your unsaved changes.Discard them"
        )
        assert.equal(
            browser.document.getElementById("song-title").value,
            "Unsaved verse"
        )
        await browser.document.getElementById(
            "discard-draft-button"
        ).click()
        assert.equal(
            browser.document.getElementById("draft-restored-notice")
                .hidden,
            true
        )
        assert.equal(
            browser.document.getElementById("song-title").value,
            ""
        )
        assert.equal(app.context.drafts.hasAny(), false)
    } finally {
        browser.restore()
    }
})

test("save failures retain the editor values and show safe API details", async () => {
    const api = createFakeApi()
    api.seed.account("owner@example.com")
    const bookId = api.seed.book({
        owner: "owner@example.com",
        name: "Failures"
    })
    api.signIn("owner@example.com")
    const rejectSave = api.intercept(request =>
        request.method === "POST" &&
        request.path === `/songbooks/${bookId}/songs`
            ? {
                status: 400,
                body: { detail: "The title is invalid." }
            }
            : undefined
    )
    const { app, browser } = createAppHarness(api, {
        initialUrl:
            `https://localhost/#/books/${bookId}/songs/new`
    })

    try {
        await app.ready
        const title = browser.document.getElementById("song-title")
        const partKey = browser.document.getElementById("parts-editor")
            .children[0].dataset.partKey
        const partName = partField(browser, partKey, "name")
        const lyrics = partField(browser, partKey, "text")
        await title.input("Keep this title")
        await partName.input("Verse")
        await lyrics.input("[G]Keep these lyrics")
        const saveButton = browser.document.getElementById(
            "editor-save-button"
        )
        saveButton.focus()
        await saveButton.click()

        assert.equal(title.value, "Keep this title")
        assert.equal(partName.value, "Verse")
        assert.equal(lyrics.value, "[G]Keep these lyrics")
        assert.ok(
            browser.document.activeElement === saveButton,
            "a failed save keeps focus on Save"
        )
        assert.equal(
            browser.text("editor-status"),
            "The API rejected the submitted song. The title is invalid. " +
                "Review the entered values and try again. " +
                "Your new song draft was kept."
        )
        assert.equal(
            browser.document.getElementById("song-editor-form")
                .getAttribute("aria-busy"),
            "false"
        )
        assert.equal(
            browser.document.getElementById("editor-save-button").textContent,
            "Save"
        )
        rejectSave()
    } finally {
        browser.restore()
    }
})

test("duplicate form submissions start only one save", async () => {
    const api = createFakeApi()
    api.seed.account("owner@example.com")
    const bookId = api.seed.book({
        owner: "owner@example.com",
        name: "Duplicate submit"
    })
    api.signIn("owner@example.com")
    let releaseRequest
    let markRequestStarted
    const requestStarted = new Promise(resolve => {
        markRequestStarted = resolve
    })
    const continueRequest = new Promise(resolve => {
        releaseRequest = resolve
    })
    const removeDelay = api.intercept(request => {
        if (
            request.method === "POST" &&
            request.path === `/songbooks/${bookId}/songs`
        ) {
            markRequestStarted()
            return continueRequest
        }
        return undefined
    })
    const { app, browser } = createAppHarness(api, {
        initialUrl:
            `https://localhost/#/books/${bookId}/songs/new`
    })

    try {
        await app.ready
        await browser.document.getElementById("song-title")
            .input("One request")
        const form = browser.document.getElementById("song-editor-form")
        const firstSave = form.submit()
        await requestStarted
        assert.equal(
            browser.document.getElementById("editor-save-button").disabled,
            true
        )
        await form.submit()
        assert.equal(
            api.requests.filter(request => request.method === "POST").length,
            1
        )

        releaseRequest(undefined)
        await firstSave
        assert.equal(browser.screen(), "song")
        assert.equal(browser.text("app-status-message"), "Song created.")
    } finally {
        removeDelay()
        browser.restore()
    }
})

test("a lost Editor role and a deleted song keep edit data in the form", async () => {
    for (const failure of ["role", "deleted"]) {
        const api = createFakeApi()
        api.seed.account("owner@example.com")
        api.seed.account("editor@example.com")
        const bookId = api.seed.book({
            owner: "owner@example.com",
            name: `Editor ${failure}`
        })
        const songId = api.seed.song(bookId, {
            title: "Existing song",
            parts: [{ name: "Verse", text: "Original lyrics" }]
        })
        api.seed.access(bookId, "editor@example.com", "editor")
        api.signIn("editor@example.com")
        let removeInterceptor = null
        if (failure === "deleted") {
            removeInterceptor = api.intercept(request =>
                request.method === "PUT" &&
                request.path === `/songbooks/${bookId}/songs/${songId}`
                    ? { status: 404, body: null }
                    : undefined
            )
        }
        const { app, browser } = createAppHarness(api, {
            initialUrl:
                `https://localhost/#/books/${bookId}/songs/${songId}/edit`
        })
        try {
            await app.ready
            const title = browser.document.getElementById("song-title")
            await title.input("Copied edit")
            if (failure === "role") {
                api.seed.access(bookId, "editor@example.com", "reader")
            }
            await browser.document.getElementById(
                "song-editor-form"
            ).submit()

            assert.equal(browser.screen(), "song-editor")
            assert.equal(title.value, "Copied edit")
            assert.equal(
                browser.text("editor-status"),
                failure === "role"
                    ? "Your account is not allowed to make this change. " +
                        "Your song data was kept."
                    : "This song was deleted by someone else. " +
                        "Copy anything you need, then cancel."
            )
            assert.equal(
                api.requests.some(request =>
                    request.method === "GET" &&
                    request.path === `/songbooks/${bookId}`
                ),
                true
            )
        } finally {
            removeInterceptor?.()
            browser.restore()
        }
    }
})

test("non-editors are redirected away from the song editor", async () => {
    const api = createFakeApi()
    api.seed.account("owner@example.com")
    api.seed.account("reader@example.com")
    const bookId = api.seed.book({
        owner: "owner@example.com",
        name: "Read only"
    })
    api.seed.access(bookId, "reader@example.com", "reader")
    api.signIn("reader@example.com")
    const { app, browser } = createAppHarness(api, {
        initialUrl:
            `https://localhost/#/books/${bookId}/songs/new`
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
            "You need Editor access to change songs in this book."
        )
        assert.equal(
            browser.document.getElementById("song-editor-form"),
            null
        )
    } finally {
        browser.restore()
    }
})
