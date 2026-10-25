import assert from "node:assert/strict"
import test from "node:test"

import { createAppHarness } from "../helpers/appHarness.mjs"
import { createFakeApi } from "../helpers/fakeApi.mjs"

test("PDF exports render metadata, outdated guidance, pagination, and role access", async () => {
    const api = createFakeApi()
    api.seed.account("owner@example.com")
    api.seed.account("reader@example.com")
    const bookId = api.seed.book({
        owner: "owner@example.com",
        name: "Shared Songs"
    })
    const selectedPdfId = api.seed.pdf(bookId, {
        id: "pdf/selected",
        includeChords: false,
        isWholeBook: false,
        songCount: 4,
        selectedSongs: [
            { id: "song-1", title: "First" },
            { id: "song-2", title: "Second" },
            { id: "song-3", title: "Third" },
            { id: "song-4", title: "Fourth" }
        ],
        generatedAtUtc: "2026-10-20T12:34:00Z",
        isOutdated: true
    })
    api.seed.pdf(bookId, {
        id: "whole",
        includeChords: true,
        isWholeBook: true,
        songCount: 4,
        generatedAtUtc: "2026-10-21T12:34:00Z"
    })
    for (let index = 0; index < 51; index++) {
        api.seed.pdf(bookId, {
            id: `older-${index}`,
            isWholeBook: true,
            songCount: 4,
            generatedAtUtc: new Date(
                Date.UTC(2026, 9, 18, 0, index)
            ).toISOString()
        })
    }
    api.seed.access(bookId, "reader@example.com", "reader")
    api.signIn("owner@example.com")

    const owner = createAppHarness(api, {
        initialUrl: `https://localhost/#/books/${bookId}/pdfs`
    })
    try {
        await owner.app.ready
        assert.equal(owner.browser.screen(), "pdfs")
        assert.equal(
            owner.browser.document.title,
            "PDF exports · Shared Songs · Śpiewnik SpoTkanie"
        )
        assert.notEqual(
            owner.browser.document.getElementById("new-pdf-link"),
            null
        )
        const list = owner.browser.document.getElementById("pdf-list")
        assert.equal(list.children.length, 50)
        const selectedItem = [...list.children].find(
            item => item.dataset.pdfId === selectedPdfId
        )
        assert.notEqual(selectedItem, undefined)
        assert.equal(
            selectedItem.children[0].children[0].textContent,
            "4 selected songs · lyrics only"
        )
        assert.equal(
            selectedItem.children[0].children[1].textContent,
            "Outdated The book changed after this PDF was created."
        )
        assert.equal(
            selectedItem.children[1].textContent,
            "First, Second, Third and 1 more"
        )
        assert.equal(
            selectedItem.children[2].children[0].textContent,
            `Created ${new Date("2026-10-20T12:34:00Z").toLocaleString()}`
        )
        assert.equal(
            selectedItem.children[2].children[0].getAttribute("datetime"),
            "2026-10-20T12:34:00Z"
        )
        assert.equal(
            selectedItem.children.at(-1).children[0]
                .getAttribute("aria-label"),
            `Download PDF created ${new Date(
                "2026-10-20T12:34:00Z"
            ).toLocaleString()}`
        )
        assert.equal(
            owner.browser.document.getElementById("show-more-pdfs").hidden,
            false
        )
        await owner.browser.document.getElementById("show-more-pdfs").click()
        assert.equal(list.children.length, 53)
    } finally {
        owner.browser.restore()
    }

    for (const accessLevel of ["reader", "editor"]) {
        const roleApi = createFakeApi()
        roleApi.seed.account("owner@example.com")
        roleApi.seed.account("member@example.com")
        const roleBookId = roleApi.seed.book({
            owner: "owner@example.com",
            name: "Shared book"
        })
        roleApi.seed.pdf(roleBookId, {
            isWholeBook: true,
            songCount: 0
        })
        roleApi.seed.access(roleBookId, "member@example.com", accessLevel)
        roleApi.signIn("member@example.com")
        const member = createAppHarness(roleApi, {
            initialUrl: `https://localhost/#/books/${roleBookId}/pdfs`
        })
        try {
            await member.app.ready
            assert.equal(member.browser.screen(), "pdfs")
            assert.equal(
                member.browser.document.getElementById("new-pdf-link"),
                null
            )
            assert.notEqual(
                member.browser.document.getElementById("pdf-list")
                    .children[0].children.at(-1).children[0],
                null
            )
        } finally {
            member.browser.restore()
        }
    }
})

test("an empty PDF list gives owners a create link and retries load failures", async () => {
    const api = createFakeApi()
    api.seed.account("owner@example.com")
    const bookId = api.seed.book({
        owner: "owner@example.com",
        name: "Empty book"
    })
    api.signIn("owner@example.com")
    let failFirstLoad = true
    api.intercept(request => {
        if (
            failFirstLoad &&
            request.path === `/songbooks/${bookId}/pdfs` &&
            request.method === "GET"
        ) {
            failFirstLoad = false
            return { status: 503, body: null }
        }
        return undefined
    })
    const { app, browser } = createAppHarness(api, {
        initialUrl: `https://localhost/#/books/${bookId}/pdfs`
    })

    try {
        await app.ready
        assert.match(
            browser.text("pdf-list-state"),
            /The server could not load PDF exports\. Try again\./
        )
        const retryButton = browser.document.getElementById(
            "pdf-list-state"
        ).children.at(-1)
        assert.equal(retryButton.textContent, "Try again")
        await retryButton.click()
        assert.equal(
            browser.text("pdf-list-state"),
            "No PDFs yet. Create the first PDF"
        )
        assert.notEqual(
            browser.document.getElementById("create-first-pdf-link"),
            null
        )
    } finally {
        browser.restore()
    }
})

test("PDF downloads disable every button, use a safe filename, and revoke the blob URL", async t => {
    t.mock.timers.enable({ apis: ["setTimeout"] })
    const api = createFakeApi()
    api.seed.account("owner@example.com")
    const bookId = api.seed.book({
        owner: "owner@example.com",
        name: "Safe / Name."
    })
    api.seed.pdf(bookId, {
        id: "pdf/one",
        isWholeBook: true,
        includeChords: true,
        songCount: 0,
        generatedAtUtc: "2026-10-22T12:34:00Z"
    })
    api.seed.pdf(bookId, {
        id: "pdf-two",
        isWholeBook: true,
        includeChords: false,
        songCount: 0,
        generatedAtUtc: "2026-10-21T12:34:00Z"
    })
    api.signIn("owner@example.com")

    let releaseDownload
    const downloadGate = new Promise(resolve => {
        releaseDownload = resolve
    })
    let markDownloadStarted
    const downloadStarted = new Promise(resolve => {
        markDownloadStarted = resolve
    })
    let downloadCount = 0
    const removeInterceptor = api.intercept(async request => {
        if (request.path.endsWith("/download")) {
            downloadCount += 1
            markDownloadStarted()
            await downloadGate
        }
        return undefined
    })
    const createdBlobs = []
    const revokedUrls = []
    const originalCreateObjectURL = URL.createObjectURL
    const originalRevokeObjectURL = URL.revokeObjectURL
    URL.createObjectURL = blob => {
        createdBlobs.push(blob)
        return `blob:pdf-${createdBlobs.length}`
    }
    URL.revokeObjectURL = url => revokedUrls.push(url)

    const { app, browser } = createAppHarness(api, {
        initialUrl: `https://localhost/#/books/${bookId}/pdfs`
    })
    try {
        await app.ready
        const list = browser.document.getElementById("pdf-list")
        const buttons = [...list.children].map(
            item => item.children.at(-1).children[0]
        )
        const firstDownload = buttons[0].click()
        await downloadStarted
        assert.equal(buttons.every(button => button.disabled), true)
        await buttons[1].click()
        assert.equal(downloadCount, 1)

        releaseDownload()
        await firstDownload
        assert.equal(createdBlobs.length, 1)
        assert.equal(createdBlobs[0].type, "application/pdf")
        assert.deepEqual(browser.downloads, [{
            href: "blob:pdf-1",
            filename: "Safe _ Name-chords-pdf_one.pdf"
        }])
        assert.equal(
            browser.document.body.children.some(element =>
                element.tagName === "A" &&
                element.getAttribute("download") !== null
            ),
            false
        )
        assert.deepEqual(revokedUrls, [])
        t.mock.timers.tick(1000)
        assert.deepEqual(revokedUrls, ["blob:pdf-1"])
        assert.equal(buttons.every(button => !button.disabled), true)
    } finally {
        releaseDownload()
        removeInterceptor()
        URL.createObjectURL = originalCreateObjectURL
        URL.revokeObjectURL = originalRevokeObjectURL
        browser.restore()
    }
})

test("PDF download failures show an actionable error", async () => {
    const api = createFakeApi()
    api.seed.account("owner@example.com")
    const bookId = api.seed.book({
        owner: "owner@example.com",
        name: "Downloads"
    })
    api.seed.pdf(bookId, { isWholeBook: true })
    api.signIn("owner@example.com")
    api.intercept(request =>
        request.path.endsWith("/download")
            ? { status: 503, body: null }
            : undefined
    )
    const { app, browser } = createAppHarness(api, {
        initialUrl: `https://localhost/#/books/${bookId}/pdfs`
    })

    try {
        await app.ready
        const downloadButton = browser.document.getElementById("pdf-list")
            .children[0].children.at(-1).children[0]
        await downloadButton.click()
        assert.equal(
            browser.text("app-status-message"),
            "Could not download the PDF. Try again."
        )
        assert.equal(downloadButton.disabled, false)
    } finally {
        browser.restore()
    }
})

test("owners can create a whole-book PDF with the default chord option", async () => {
    const api = createFakeApi()
    api.seed.account("owner@example.com")
    const bookId = api.seed.book({
        owner: "owner@example.com",
        name: "Sunday Service"
    })
    api.seed.song(bookId, { title: "Amazing Grace" })
    api.signIn("owner@example.com")
    const { app, browser } = createAppHarness(api, {
        initialUrl: `https://localhost/#/books/${bookId}/pdfs`
    })

    try {
        await app.ready
        await browser.document.getElementById("new-pdf-link").click()
        assert.equal(browser.screen(), "pdf-new")
        assert.equal(
            browser.document.getElementById("pdf-scope-whole").checked,
            true
        )
        assert.equal(
            browser.document.getElementById("pdf-include-chords").checked,
            true
        )
        assert.equal(api.requests.some(request =>
            request.path === `/songbooks/${bookId}/songs`
        ), false)

        await browser.document.getElementById("pdf-form").submit()
        assert.equal(browser.screen(), "pdfs")
        const createdRequest = api.requests.find(request =>
            request.method === "POST" &&
            request.path === `/songbooks/${bookId}/pdfs`
        )
        assert.deepEqual(createdRequest.body, { includeChords: true })
        assert.equal(browser.text("app-status-message"), "PDF created.")
        assert.equal(
            browser.document.getElementById("pdf-list").children.length,
            1
        )
    } finally {
        browser.restore()
    }
})

test("selected-song PDFs preserve selections across search and pagination", async t => {
    t.mock.timers.enable({ apis: ["setTimeout"] })
    const api = createFakeApi()
    api.seed.account("owner@example.com")
    const bookId = api.seed.book({
        owner: "owner@example.com",
        name: "Many songs"
    })
    const songIds = []
    for (let index = 0; index < 55; index++) {
        songIds.push(api.seed.song(bookId, {
            title: index === 54
                ? "Unique final song"
                : `Song ${String(index).padStart(2, "0")}`,
            number: index + 1
        }))
    }
    api.signIn("owner@example.com")
    const { app, browser } = createAppHarness(api, {
        initialUrl: `https://localhost/#/books/${bookId}/pdfs/new`
    })

    try {
        await app.ready
        assert.equal(api.requests.some(request =>
            request.path === `/songbooks/${bookId}/songs`
        ), false)
        await browser.document.getElementById("pdf-scope-selected").click()
        await browser.settle()
        assert.equal(
            browser.document.getElementById("pdf-song-list").children.length,
            50
        )

        await browser.document.getElementById("pdf-form").submit()
        assert.equal(
            browser.text("pdf-form-error"),
            "Choose at least one song."
        )
        assert.equal(api.requests.some(request =>
            request.method === "POST" &&
            request.path === `/songbooks/${bookId}/pdfs`
        ), false)

        const songList = browser.document.getElementById("pdf-song-list")
        await songList.children[0].children[0].children[0].click()
        assert.equal(
            browser.text("pdf-selection-count"),
            "1 song selected"
        )
        const searchInput = browser.document.getElementById("pdf-song-search")
        await searchInput.input("Unique final")
        t.mock.timers.tick(300)
        await browser.settle()
        assert.equal(songList.children.length, 1)
        assert.equal(
            api.requests.some(request =>
                request.path === `/songbooks/${bookId}/songs` &&
                request.query.search === "Unique final"
            ),
            true
        )
        await songList.children[0].children[0].children[0].click()
        assert.equal(
            browser.text("pdf-selection-count"),
            "2 songs selected"
        )

        await searchInput.input("")
        t.mock.timers.tick(300)
        await browser.settle()
        assert.equal(songList.children.length, 50)
        assert.equal(
            songList.children[0].children[0].children[0].checked,
            true
        )
        await browser.document.getElementById("show-more-pdf-songs").click()
        assert.equal(songList.children.length, 55)
        assert.equal(
            browser.text("pdf-selection-count"),
            "2 songs selected"
        )

        await browser.document.getElementById("pdf-form").submit()
        assert.equal(browser.screen(), "pdfs")
        const createdRequest = api.requests.find(request =>
            request.method === "POST" &&
            request.path === `/songbooks/${bookId}/pdfs`
        )
        assert.deepEqual(createdRequest.body, {
            includeChords: true,
            songIds: [songIds[0], songIds[54]]
        })
        assert.equal(browser.text("app-status-message"), "PDF created.")
    } finally {
        browser.restore()
    }
})

test("non-owners are redirected from PDF creation without loading songs", async () => {
    for (const accessLevel of ["reader", "editor"]) {
        const api = createFakeApi()
        api.seed.account("owner@example.com")
        api.seed.account("member@example.com")
        const bookId = api.seed.book({
            owner: "owner@example.com",
            name: "Shared book"
        })
        api.seed.access(bookId, "member@example.com", accessLevel)
        api.signIn("member@example.com")
        const { app, browser } = createAppHarness(api, {
            initialUrl: `https://localhost/#/books/${bookId}/pdfs/new`
        })

        try {
            await app.ready
            assert.equal(browser.screen(), "pdfs")
            assert.equal(
                browser.location.hash,
                `#/books/${bookId}/pdfs`
            )
            assert.equal(
                browser.text("app-status-message"),
                "Only the owner can create PDFs."
            )
            assert.equal(api.requests.some(request =>
                request.path === `/songbooks/${bookId}/songs`
            ), false)
        } finally {
            browser.restore()
        }
    }
})
