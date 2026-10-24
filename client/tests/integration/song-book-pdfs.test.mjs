import assert from "node:assert/strict"
import test from "node:test"

import { installTestBrowser } from "../helpers/testBrowser.mjs"

test("readers and editors can list and download exports but cannot generate them", async () => {
    const books = [
        book("reader-book", "reader"),
        book("editor-book", "editor"),
        book("owner-book", "admin")
    ]
    const stale = pdf({
        id: "stale-pdf",
        includeChords: false,
        isWholeBook: false,
        songCount: 1,
        selectedSongs: [{
            id: "song-1",
            title: "<img src=x onerror=alert(1)>"
        }],
        isOutdated: true
    })
    const current = pdf({
        id: "current-pdf",
        songCount: 3
    })
    const browser = installTestBrowser(
        () => ({ body: [] }),
        {
            songBookHandler: request =>
                request.url === "/songbooks"
                    ? { body: books }
                    : request.url.endsWith("/access")
                        ? { body: [] }
                    : { body: books.find(candidate =>
                        request.url.endsWith(`/${candidate.id}`)
                    ) },
            pdfHandler: request =>
                request.url.endsWith("/download")
                    ? {
                        body: "%PDF-1.7 download",
                        contentType: "application/pdf"
                    }
                    : { body: [stale, current] }
        }
    )
    const downloadClicks = []
    const createElement = browser.document.createElement.bind(
        browser.document
    )
    browser.document.createElement = tagName => {
        const element = createElement(tagName)
        if (tagName === "a") {
            element.addEventListener("click", () => {
                downloadClicks.push({
                    name: element.download,
                    href: element.href
                })
            })
        }
        return element
    }

    const app = await import("../../src/main.js?pdf-permissions")
    await app.initialization

    for (const access of ["reader", "editor"]) {
        await selectBook(browser, `${access}-book`)
        assert.equal(app.state.selectedSongBookAccessLevel, access)
        assert.equal(browser.getElement("song-book-pdfs-panel").hidden, false)
        assert.equal(browser.getElement("song-book-pdf-form").hidden, true)
        assert.equal(browser.getButton("Generate PDF"), undefined)
        assert.deepEqual(
            app.state.songBookPdfs.map(exported => exported.id),
            ["stale-pdf", "current-pdf"]
        )
        const displayed = browser.getElement(
            "song-book-pdfs-list"
        ).textContent
        assert.match(displayed, /Lyrics only/)
        assert.match(displayed, /With chords/)
        assert.match(displayed, /Selected songs \(1 song\)/)
        assert.match(displayed, /Entire book \(3 songs\)/)
        assert.match(displayed, /Outdated — song book changed/)
        assert.match(displayed, /Up to date/)
        assert.match(
            displayed,
            new RegExp(
                new Date(stale.generatedAtUtc)
                    .toLocaleString()
                    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
            )
        )
        assert.match(displayed, /<img src=x onerror=alert\(1\)>/)
        assert.equal(
            browser.findElements(element =>
                element.tagName === "IMG"
            ).length,
            0
        )

        await browser.getButtons("Download PDF")[0].click()
    }

    assert.equal(downloadClicks.length, 2)
    assert.ok(downloadClicks.every(click =>
        click.href.startsWith("blob:") &&
        click.name.endsWith("-lyrics-stale-pdf.pdf")
    ))
    assert.equal(
        browser.songBookRequests.filter(request =>
            request.url.endsWith("/download")
        ).length,
        2
    )
    assert.equal(
        browser.songBookRequests.some(request =>
            request.method === "POST" &&
            request.url.endsWith("/pdfs")
        ),
        false
    )

    await selectBook(browser, "owner-book")
    assert.equal(browser.getElement("song-book-pdf-form").hidden, false)
    assert.notEqual(browser.getButton("Generate PDF"), undefined)
})

test("owner can generate whole-book and cross-page selected-song PDFs", async () => {
    const songs = Array.from({ length: 53 }, (_, index) => ({
        id: `song-${index}`,
        title: `Song ${index}`,
        parts: []
    }))
    const exports = []
    const submitted = []
    const browser = installTestBrowser(
        () => ({ body: songs }),
        {
            pdfHandler: request => {
                if (request.method === "GET") {
                    return { body: exports }
                }
                const payload = JSON.parse(request.body)
                submitted.push(payload)
                const selectedSongs = payload.songIds?.map(id => ({
                    id,
                    title: songs.find(song => song.id === id).title
                })) ?? []
                const created = pdf({
                    id: `pdf-${submitted.length}`,
                    includeChords: payload.includeChords,
                    isWholeBook: payload.songIds === undefined,
                    songCount: payload.songIds?.length ?? songs.length,
                    selectedSongs
                })
                exports.unshift(created)
                return { body: created, status: 201 }
            }
        }
    )
    const app = await import("../../src/main.js?pdf-subset-pages")
    await app.initialization

    assert.equal(app.state.songHasNext, true)
    assert.equal(browser.getElement("song-book-pdfs-state").textContent,
        "No PDF exports yet.")
    await browser.getElement("song-book-pdf-form").submit()
    assert.deepEqual(submitted[0], { includeChords: true })
    assert.match(
        browser.getElement("song-book-pdfs-list").textContent,
        /With chordsEntire book \(53 songs\)/
    )

    const scope = browser.getElement("song-book-pdf-scope")
    scope.value = "selected"
    await scope.dispatch("change")
    assert.match(
        browser.getElement("song-book-pdf-selection-state").textContent,
        /use song pages to reach every song/
    )
    await browser.getElement("song-book-pdf-form").submit()
    assert.match(
        browser.getElement("app-status").textContent,
        /Select at least one song/
    )
    assert.equal(submitted.length, 1)

    await checkSong(browser, "song-1")
    await browser.getButton("Next songs").click()
    assert.equal(app.state.songPage, 2)
    await checkSong(browser, "song-52")
    await browser.getButton("Previous songs").click()
    assert.equal(pdfCheckbox(browser, "song-1").checked, true)
    assert.deepEqual(
        [...app.state.pdfSelectedSongs.keys()],
        ["song-1", "song-52"]
    )
    assert.match(
        browser.getElement("song-book-pdf-selection-state").textContent,
        /Song 1, Song 52/
    )

    browser.getElement("song-book-pdf-include-chords").checked = false
    await browser.getElement("song-book-pdf-form").submit()

    assert.deepEqual(submitted[1], {
        includeChords: false,
        songIds: ["song-1", "song-52"]
    })
    assert.equal(app.state.songBookPdfs[0].isWholeBook, false)
    assert.match(
        browser.getElement("song-book-pdfs-list").children[0].textContent,
        /Lyrics onlySelected songs \(2 songs\): Song 1, Song 52/
    )
    assert.equal(
        browser.getElement("app-status").textContent,
        "PDF generated."
    )
    await browser.getButton("Next songs").click()
    assert.equal(pdfCheckbox(browser, "song-52").checked, true)
})

test("PDF pages recover after removal and keep stale entries on refresh failures", async () => {
    const exports = Array.from({ length: 51 }, (_, index) =>
        pdf({ id: `pdf-${index}` })
    )
    let failList = false
    const browser = installTestBrowser(
        () => ({ body: [] }),
        {
            pdfHandler: () => failList
                ? {
                    body: { title: "Unavailable" },
                    status: 503
                }
                : { body: exports }
        }
    )
    const app = await import("../../src/main.js?pdf-pages")
    await app.initialization

    assert.equal(app.state.songBookPdfs.length, 50)
    assert.equal(app.state.pdfHasNext, true)
    assert.equal(browser.getElement("pdf-pagination").hidden, false)
    await browser.getButton("Next PDFs").click()
    assert.equal(app.state.pdfPage, 2)
    assert.equal(app.state.songBookPdfs[0].id, "pdf-50")
    assert.equal(browser.getElement("pdf-page-status").textContent, "Page 2")
    assert.equal(browser.getElement("next-pdf-page-button").disabled, true)

    const loggedErrors = []
    const originalError = console.error
    console.error = error => loggedErrors.push(error)
    try {
        failList = true
        await browser.getButton("Refresh PDFs").click()
        assert.equal(app.state.pdfPage, 2)
        assert.equal(app.state.songBookPdfs[0].id, "pdf-50")
        assert.match(
            browser.getElement("song-book-pdfs-state").textContent,
            /Displayed exports and statuses may be out of date/
        )
        assert.match(
            browser.getElement("app-status").textContent,
            /server could not load PDF exports.*displayed exports may be out of date/i
        )
    } finally {
        console.error = originalError
    }
    assert.equal(loggedErrors.length, 1)

    failList = false
    exports.pop()
    await browser.getButton("Refresh PDFs").click()
    assert.equal(app.state.pdfPage, 1)
    assert.equal(app.state.songBookPdfs.length, 50)
    assert.equal(browser.getElement("pdf-pagination").hidden, true)
    assert.equal(browser.getElement("app-status").textContent,
        "PDF exports loaded.")
    assert.deepEqual(
        browser.songBookRequests.filter(request =>
            request.url.includes("/pdfs?page=2")
        ).map(request => request.method),
        ["GET", "GET", "GET"]
    )
})

test("book rename and song writes refresh PDF staleness and selected titles", async () => {
    const selectedBook = book("default-book")
    const songs = [{
        id: "song-a",
        title: "Original",
        parts: []
    }]
    let isOutdated = false
    let pdfFetches = 0
    const browser = installTestBrowser(
        request => {
            const id = request.url.split("/").filter(Boolean)[1]
            if (request.method === "GET") {
                return {
                    body: id === undefined
                        ? songs
                        : songs.find(song => song.id === id)
                }
            }
            if (request.method === "POST") {
                const created = {
                    id: "song-b",
                    ...JSON.parse(request.body),
                    parts: []
                }
                songs.push(created)
                isOutdated = true
                return { body: created, status: 201 }
            }
            if (request.method === "PUT") {
                Object.assign(
                    songs.find(song => song.id === id),
                    JSON.parse(request.body)
                )
                isOutdated = true
                return { body: null, status: 204 }
            }
            if (request.method === "DELETE") {
                songs.splice(songs.findIndex(song => song.id === id), 1)
                isOutdated = true
                return { body: null, status: 204 }
            }
            throw new Error(`Unexpected song request ${request.url}`)
        },
        {
            songBookHandler: request => {
                if (request.url === "/songbooks") {
                    return { body: [selectedBook] }
                }
                if (request.url.endsWith("/access")) {
                    return { body: [] }
                }
                if (request.method === "PUT") {
                    selectedBook.name = JSON.parse(request.body).name
                    isOutdated = true
                    return { body: null, status: 204 }
                }
                return { body: selectedBook }
            },
            pdfHandler: () => {
                pdfFetches += 1
                return {
                    body: [pdf({ isOutdated, songCount: songs.length })]
                }
            }
        }
    )
    const app = await import("../../src/main.js?pdf-mutations")
    await app.initialization

    assert.equal(pdfFetches, 1)
    assert.match(
        browser.getElement("song-book-pdfs-list").textContent,
        /Up to date/
    )
    const scope = browser.getElement("song-book-pdf-scope")
    scope.value = "selected"
    await scope.dispatch("change")
    await checkSong(browser, "song-a")

    await browser.getButton("Rename").click()
    browser.getElement("song-book-name").value = "Renamed book"
    await browser.getElement("song-book-form").submit()
    assert.equal(pdfFetches, 2)
    assert.match(
        browser.getElement("song-book-pdfs-list").textContent,
        /Outdated/
    )

    await browser.getButton("New song").click()
    browser.getElement("song-title").value = "New song"
    await browser.getElement("song-form").submit()
    assert.equal(pdfFetches, 3)
    assert.equal(app.state.pdfSelectedSongs.get("song-a"), "Original")

    await browser.getButtons("View").find(button =>
        button.dataset.songId === "song-a"
    ).click()
    await browser.getButton("Edit song").click()
    browser.getElement("song-title").value = "Updated title"
    await browser.getElement("song-form").submit()
    assert.equal(pdfFetches, 4)
    assert.equal(app.state.pdfSelectedSongs.get("song-a"),
        "Updated title")
    assert.match(
        browser.getElement("song-book-pdf-selection-state").textContent,
        /Updated title/
    )

    await browser.findElements(element =>
        element.dataset?.action === "delete-song" &&
        element.dataset.songId === "song-a"
    )[0].click()
    assert.equal(pdfFetches, 5)
    assert.equal(app.state.pdfSelectedSongs.size, 0)
    assert.equal(pdfCheckbox(browser, "song-b").checked, false)
})

test("late PDF list and download responses cannot leak across books or logout", async () => {
    let authenticated = true
    let deferRefresh = false
    let firstARequest = true
    const firstList = deferred()
    const lateRefresh = deferred()
    const lateDownload = deferred()
    const books = [book("book-a"), book("book-b")]
    const browser = installTestBrowser(
        () => ({ body: [] }),
        {
            authHandler: request => {
                if (request.url === "/auth/me") {
                    return {
                        body: {
                            isAuthenticated: authenticated,
                            email: authenticated
                                ? "owner@example.test"
                                : null
                        }
                    }
                }
                if (request.url === "/auth/logout") {
                    authenticated = false
                    return { body: null, status: 204 }
                }
                throw new Error(`Unexpected auth request ${request.url}`)
            },
            songBookHandler: request =>
                request.url === "/songbooks"
                    ? { body: authenticated ? books : [] }
                    : request.url.endsWith("/access")
                        ? { body: [] }
                        : {
                            body: books.find(candidate =>
                                request.url.endsWith(`/${candidate.id}`)
                            )
                        },
            pdfHandler: request => {
                if (request.url.endsWith("/download")) {
                    return lateDownload.promise
                }
                if (request.url.includes("/book-a/")) {
                    if (firstARequest) {
                        firstARequest = false
                        return firstList.promise
                    }
                    return deferRefresh
                        ? lateRefresh.promise
                        : { body: [pdf({ id: "private-a" })] }
                }
                return { body: [pdf({ id: "private-b" })] }
            }
        }
    )
    const downloads = []
    const createElement = browser.document.createElement.bind(
        browser.document
    )
    browser.document.createElement = tagName => {
        const element = createElement(tagName)
        if (tagName === "a") {
            element.addEventListener("click", () =>
                downloads.push(element.download)
            )
        }
        return element
    }
    const app = await import("../../src/main.js?pdf-races")
    await app.initialization

    const selectA = selectBook(browser, "book-a")
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(app.state.isLoadingPdfs, true)
    await selectBook(browser, "book-b")
    firstList.resolve({
        body: [pdf({
            id: "late-a",
            selectedSongs: [{
                id: "private-song",
                title: "Must not appear"
            }]
        })]
    })
    await selectA
    assert.equal(app.state.selectedSongBookId, "book-b")
    assert.deepEqual(
        app.state.songBookPdfs.map(exported => exported.id),
        ["private-b"]
    )
    assert.doesNotMatch(browser.document.body.textContent,
        /Must not appear/)

    const download = browser.getButton("Download PDF").click()
    await new Promise(resolve => setImmediate(resolve))
    await selectBook(browser, "book-a")
    lateDownload.resolve({
        body: "%PDF-1.7 stale download",
        contentType: "application/pdf"
    })
    await download
    assert.deepEqual(downloads, [])
    assert.equal(app.state.selectedSongBookId, "book-a")

    deferRefresh = true
    const refreshing = browser.getButton("Refresh PDFs").click()
    await new Promise(resolve => setImmediate(resolve))
    await browser.getButton("Sign out").click()
    lateRefresh.resolve({
        body: [pdf({
            id: "late-after-logout",
            selectedSongs: [{
                id: "private-song",
                title: "Never reappear"
            }]
        })]
    })
    await refreshing

    assert.equal(app.state.auth.status, "anonymous")
    assert.equal(app.state.selectedSongBookId, null)
    assert.deepEqual(app.state.songBookPdfs, [])
    assert.doesNotMatch(browser.document.body.textContent,
        /Never reappear|private-a|private-b/)
})

test("a 403 on generation refreshes downgraded owner access without hiding exports", async () => {
    let accessLevel = "admin"
    const browser = installTestBrowser(
        () => ({
            body: [{ id: "song-1", title: "Selected" }]
        }),
        {
            songBookHandler: request =>
                request.url === "/songbooks"
                    ? { body: [book("default-book", accessLevel)] }
                    : request.url.endsWith("/access")
                        ? { body: [] }
                        : {
                            body: book("default-book", accessLevel)
                        },
            pdfHandler: request => {
                if (request.method === "POST") {
                    accessLevel = "editor"
                    return {
                        body: { title: "Forbidden" },
                        status: 403
                    }
                }
                return { body: [pdf({ id: "existing" })] }
            }
        }
    )
    const app = await import("../../src/main.js?pdf-downgrade")
    await app.initialization

    const scope = browser.getElement("song-book-pdf-scope")
    scope.value = "selected"
    await scope.dispatch("change")
    await checkSong(browser, "song-1")
    await browser.getElement("song-book-pdf-form").submit()

    assert.equal(app.state.selectedSongBookAccessLevel, "editor")
    assert.equal(browser.getElement("song-book-pdfs-panel").hidden, false)
    assert.equal(browser.getElement("song-book-pdf-form").hidden, true)
    assert.deepEqual(app.state.songBookPdfs.map(item => item.id),
        ["existing"])
    assert.equal(app.state.pdfSelectedSongs.size, 0)
    assert.equal(pdfCheckbox(browser, "song-1"), undefined)
    assert.equal(
        browser.getElement("app-status").textContent,
        "Only the song-book owner can generate PDFs."
    )
    assert.equal(
        browser.songBookRequests.filter(request =>
            request.method === "POST" &&
            request.url.endsWith("/pdfs")
        ).length,
        1
    )
})

test("revocation during a PDF refresh clears cached exports and private song titles", async () => {
    let accessible = true
    const browser = installTestBrowser(
        () => ({
            body: [{
                id: "private-song",
                title: "Private song title"
            }]
        }),
        {
            songBookHandler: request => {
                if (request.url === "/songbooks") {
                    return {
                        body: accessible ? [book("default-book")] : []
                    }
                }
                if (!accessible) {
                    return {
                        body: { title: "Not found" },
                        status: 404
                    }
                }
                return request.url.endsWith("/access")
                    ? { body: [] }
                    : { body: book("default-book") }
            },
            pdfHandler: () => accessible
                ? {
                    body: [pdf({
                        isWholeBook: false,
                        selectedSongs: [{
                            id: "private-song",
                            title: "Private PDF song title"
                        }]
                    })]
                }
                : {
                    body: { title: "Forbidden" },
                    status: 403
                }
        }
    )
    const app = await import("../../src/main.js?pdf-revocation")
    await app.initialization
    assert.match(browser.document.body.textContent,
        /Private PDF song title/)

    accessible = false
    await browser.getButton("Refresh PDFs").click()

    assert.equal(app.state.selectedSongBookId, null)
    assert.deepEqual(app.state.songBookPdfs, [])
    assert.equal(browser.getElement("song-book-pdfs-panel").hidden, true)
    assert.equal(
        browser.getElement("app-status").textContent,
        "That song book is no longer available to your account."
    )
    assert.doesNotMatch(browser.document.body.textContent,
        /Private song title|Private PDF song title/)
})

test("PDF download 401 clears the session while missing exports can refresh in place", async () => {
    let authenticated = true
    let downloadStatus = 404
    const exports = [pdf({ id: "vanished-pdf" })]
    const browser = installTestBrowser(
        () => ({ body: [] }),
        {
            authHandler: request => {
                if (request.url === "/auth/me") {
                    return {
                        body: {
                            isAuthenticated: authenticated,
                            email: authenticated
                                ? "owner@example.test"
                                : null
                        }
                    }
                }
                throw new Error(`Unexpected auth request ${request.url}`)
            },
            pdfHandler: request => {
                if (request.url.endsWith("/download")) {
                    if (downloadStatus === 401) {
                        authenticated = false
                    } else {
                        exports.length = 0
                    }
                    return {
                        body: { title: "Not available" },
                        status: downloadStatus
                    }
                }
                return { body: exports }
            }
        }
    )
    const app = await import("../../src/main.js?pdf-download-errors")
    await app.initialization
    await browser.getButton("Download PDF").click()

    assert.equal(app.state.selectedSongBookId, "default-book")
    assert.deepEqual(app.state.songBookPdfs, [])
    assert.equal(
        browser.getElement("app-status").textContent,
        "That PDF export is no longer available. The list was refreshed."
    )

    exports.push(pdf({ id: "restricted-pdf" }))
    await browser.getButton("Refresh PDFs").click()
    downloadStatus = 401
    await browser.getButton("Download PDF").click()

    assert.equal(app.state.auth.status, "anonymous")
    assert.equal(app.state.authView, "login")
    assert.equal(app.state.selectedSongBookId, null)
    assert.deepEqual(app.state.songBookPdfs, [])
    assert.equal(
        browser.document.activeElement,
        browser.getElement("login-email")
    )
    assert.match(
        browser.getElement("app-status").textContent,
        /session ended/
    )
    assert.doesNotMatch(browser.document.body.textContent,
        /restricted-pdf/)
})

test("PDF generation errors keep the chosen songs and chords option for retry", async () => {
    const browser = installTestBrowser(
        () => ({
            body: [{ id: "song-1", title: "Retry me" }]
        }),
        {
            pdfHandler: request =>
                request.method === "POST"
                    ? {
                        body: {
                            detail: "One of the selected songs is invalid."
                        },
                        status: 400
                    }
                    : { body: [] }
        }
    )
    const app = await import("../../src/main.js?pdf-validation")
    await app.initialization
    const scope = browser.getElement("song-book-pdf-scope")
    scope.value = "selected"
    await scope.dispatch("change")
    await checkSong(browser, "song-1")
    browser.getElement("song-book-pdf-include-chords").checked = false
    const originalError = console.error
    const errors = []
    console.error = error => errors.push(error)
    try {
        await browser.getElement("song-book-pdf-form").submit()
    } finally {
        console.error = originalError
    }

    assert.deepEqual(errors.map(error => error.status), [400])
    assert.equal(app.state.pdfSelectedSongs.get("song-1"), "Retry me")
    assert.equal(browser.getElement("song-book-pdf-scope").value,
        "selected")
    assert.equal(
        browser.getElement("song-book-pdf-include-chords").checked,
        false
    )
    assert.equal(browser.getElement("song-book-pdf-form").hidden, false)
    assert.equal(
        browser.getElement("app-status").textContent,
        "The PDF request was rejected. " +
            "One of the selected songs is invalid."
    )
})

test("late generation cannot display another book's or a signed-out user's export", async () => {
    let authenticated = true
    const posts = [deferred(), deferred()]
    const books = [book("book-a"), book("book-b")]
    const saved = new Map()
    let nextPost = 0
    const browser = installTestBrowser(
        () => ({ body: [] }),
        {
            authHandler: request => {
                if (request.url === "/auth/me") {
                    return {
                        body: {
                            isAuthenticated: authenticated,
                            email: authenticated
                                ? "owner@example.test"
                                : null
                        }
                    }
                }
                if (request.url === "/auth/logout") {
                    authenticated = false
                    return { body: null, status: 204 }
                }
                throw new Error(`Unexpected auth request ${request.url}`)
            },
            songBookHandler: request =>
                request.url === "/songbooks"
                    ? { body: authenticated ? books : [] }
                    : request.url.endsWith("/access")
                        ? { body: [] }
                        : {
                            body: books.find(candidate =>
                                request.url.endsWith(`/${candidate.id}`)
                            )
                        },
            pdfHandler: request => request.method === "POST"
                ? posts[nextPost++].promise
                : {
                    body: saved.get(
                        request.url.split("/").filter(Boolean)[1]
                    ) ?? []
                }
        }
    )
    const app = await import("../../src/main.js?pdf-late-generation")
    await app.initialization
    await selectBook(browser, "book-a")

    const firstGeneration = browser.getElement(
        "song-book-pdf-form"
    ).submit()
    await new Promise(resolve => setImmediate(resolve))
    await selectBook(browser, "book-b")
    const oldPdf = pdf({
        id: "old-account-pdf",
        selectedSongs: [{
            id: "private",
            title: "Old book secret"
        }]
    })
    saved.set("book-a", [oldPdf])
    posts[0].resolve({ body: oldPdf, status: 201 })
    await firstGeneration

    assert.equal(app.state.selectedSongBookId, "book-b")
    assert.deepEqual(app.state.songBookPdfs, [])
    assert.doesNotMatch(browser.document.body.textContent,
        /Old book secret|PDF generated/)

    await selectBook(browser, "book-a")
    assert.deepEqual(app.state.songBookPdfs, [oldPdf])
    const secondGeneration = browser.getElement(
        "song-book-pdf-form"
    ).submit()
    await new Promise(resolve => setImmediate(resolve))
    await browser.getButton("Sign out").click()
    posts[1].resolve({
        body: pdf({
            id: "late-pdf",
            selectedSongs: [{
                id: "private",
                title: "Signed-out secret"
            }]
        }),
        status: 201
    })
    await secondGeneration

    assert.equal(app.state.auth.status, "anonymous")
    assert.deepEqual(app.state.songBookPdfs, [])
    assert.doesNotMatch(browser.document.body.textContent,
        /Old book secret|Signed-out secret|PDF generated/)
})

function book(id, accessLevel = "admin") {
    return {
        id,
        name: `${id} songs`,
        accessLevel,
        songCount: 0
    }
}

function pdf(overrides = {}) {
    return {
        id: "pdf-1",
        includeChords: true,
        isWholeBook: true,
        songCount: 1,
        selectedSongs: [],
        generatedAtUtc: "2026-09-30T20:00:00Z",
        isOutdated: false,
        ...overrides
    }
}

function selectBook(browser, bookId) {
    return browser.findElements(element =>
        element.dataset?.action === "select-song-book" &&
        element.dataset.songBookId === bookId
    )[0].click()
}

function pdfCheckbox(browser, songId) {
    return browser.findElements(element =>
        element.dataset?.action === "select-pdf-song" &&
        element.dataset.songId === songId
    )[0]
}

async function checkSong(browser, songId) {
    const checkbox = pdfCheckbox(browser, songId)
    checkbox.checked = true
    await checkbox.dispatch("change")
}

function deferred() {
    let resolve
    const promise = new Promise(fulfill => {
        resolve = fulfill
    })
    return { promise, resolve }
}
