import assert from "node:assert/strict"
import test from "node:test"
import { createAppHarness } from "../helpers/appHarness.mjs"
import { createFakeApi } from "../helpers/fakeApi.mjs"

function seed() {
    const api = createFakeApi()
    api.seed.account("owner@example.com")
    api.seed.account("reader@example.com")
    const source = api.seed.book({ owner: "owner@example.com", name: "A source" })
    api.seed.access(source, "reader@example.com", "reader")
    const song = api.seed.song(source, {
        title: "<Literal title>", author: "Author", originalTitle: "Old",
        number: "7", key: "Am", tempo: "120",
        parts: [
            { name: "Verse", text: "😀Żółć\r\nexact  ", chords: [{ offset: 0, symbol: "C" }, { offset: 2, symbol: "Am" }] },
            { name: "Chorus", text: "\nReturn\n", chords: [] }
        ]
    })
    api.signIn("reader@example.com")
    return { api, source, song }
}

function target(api, name = "Z destination", access = "editor") {
    const id = api.seed.book({ owner: "owner@example.com", name })
    api.seed.access(id, "reader@example.com", access)
    return id
}

function start(api, source, song) {
    return createAppHarness(api, {
        initialUrl: `https://localhost/#/books/${source}/songs/${song}/copy`
    })
}

function radio(browser, index = 0) {
    return browser.document.getElementById("copy-destinations").children[index].children[0].children[0]
}

function deferred() {
    let resolve
    const promise = new Promise(done => { resolve = done })
    return { promise, resolve }
}

test("reader action copies exact content into a paged writable destination and starts new history", async () => {
    const { api, source, song } = seed()
    for (let index = 0; index < 55; index++) {
        target(api, `B read-only ${String(index).padStart(2, "0")}`, "reader")
    }
    const destination = target(api, "Z destination <literal>")
    const { app, browser } = createAppHarness(api, {
        initialUrl: `https://localhost/#/books/${source}/songs/${song}`
    })
    try {
        await app.ready
        assert.equal(browser.document.getElementById("edit-song-link"), null)
        await browser.document.getElementById("copy-song-link").click()
        assert.equal(browser.screen(), "song-copy")
        assert.equal(browser.document.getElementById("copy-destinations").children.length, 1)
        assert.equal(browser.document.getElementById("copy-destinations").children[0].children[0].children[1].textContent, "Z destination <literal>")
        assert.equal(radio(browser).dataset.bookId, destination)
        assert.equal(browser.document.getElementById("copy-song-button").disabled, true)
        await radio(browser).change(destination)
        await browser.document.getElementById("copy-song-form").submit()
        assert.equal(browser.screen(), "song")
        assert.match(browser.location.hash, new RegExp(`^#/books/${destination}/songs/`))
        assert.equal(browser.text("screen-heading"), "<Literal title>")
        const copyRequest = api.requests.find(request => request.path.endsWith("/songs/copy"))
        assert.deepEqual(copyRequest.body, { sourceBookId: source, sourceSongId: song })
        assert.equal(copyRequest.headers["x-csrf-token"], "test-antiforgery-token")
        const copiedId = browser.location.hash.split("/").at(-1)
        const original = await (await api.handle({ method: "GET", path: `/songbooks/${source}/songs/${song}` })).json()
        const copied = await (await api.handle({ method: "GET", path: `/songbooks/${destination}/songs/${copiedId}` })).json()
        assert.notEqual(original.id, copied.id)
        for (const [index, part] of copied.parts.entries()) {
            assert.notEqual(part.id, original.parts[index].id)
            assert.deepEqual({ ...part, id: null }, { ...original.parts[index], id: null })
        }
        assert.equal(copied.revision, 1)
        const history = await (await api.handle({ method: "GET", path: `/songbooks/${destination}/songs/${copiedId}/history/1` })).json()
        assert.equal(history.summary.operation, "song.copied")
        assert.equal(history.snapshot.song.songBookId, destination)
        assert.equal(JSON.stringify(history).includes(source), false)
    } finally {
        browser.restore()
    }
})

test("picker skips entire filtered-empty pages, pages more targets, excludes source and reader books", async () => {
    const { api, source, song } = seed()
    for (let index = 0; index < 100; index++) target(api, `B reader ${index}`, "reader")
    for (let index = 0; index < 52; index++) target(api, `Z writable ${String(index).padStart(2, "0")}`)
    const { app, browser } = start(api, source, song)
    try {
        await app.ready
        assert.equal(browser.document.getElementById("copy-destinations").children.length, 49)
        assert.equal(api.requests.some(request => request.path === "/songbooks" && request.query.page === "3"), true)
        await radio(browser).change(radio(browser).dataset.bookId)
        const selected = radio(browser)
        await browser.document.getElementById("copy-show-more").click()
        assert.equal(browser.document.getElementById("copy-destinations").children.length, 52)
        assert.equal(selected.checked, true)
        assert.equal(browser.document.getElementById("copy-show-more").hidden, true)
        assert.equal(browser.document.getElementById("copy-song-button").disabled, false)
    } finally {
        browser.restore()
    }
})

test("no targets gives guidance, validates selection and cancel returns to source", async () => {
    const { api, source, song } = seed()
    for (let index = 0; index < 51; index++) target(api, `Reader ${index}`, "reader")
    const { app, browser } = start(api, source, song)
    try {
        await app.ready
        assert.match(browser.text("copy-destinations-state"), /No writable destination.*Create another book/)
        await browser.document.getElementById("copy-song-form").submit()
        assert.equal(browser.text("copy-song-error"), "Choose a destination song book.")
        assert.equal(api.requests.some(request => request.method === "POST" && request.path.endsWith("/copy")), false)
        await browser.document.getElementById("cancel-copy-link").click()
        assert.equal(browser.location.hash, `#/books/${source}/songs/${song}`)
    } finally {
        browser.restore()
    }
})

for (const status of [400, 403, 404, 500]) {
    test(`copy ${status} failure retains selection and permits retry`, async () => {
        const { api, source, song } = seed()
        const destination = target(api)
        const remove = api.intercept(request => request.path.endsWith("/songs/copy")
            ? { status, body: { title: "Rejected" } } : undefined)
        const { app, browser } = start(api, source, song)
        try {
            await app.ready
            await radio(browser).change(destination)
            await browser.document.getElementById("copy-song-form").submit()
            assert.equal(browser.screen(), "song-copy")
            assert.equal(radio(browser).checked, true)
            assert.equal(radio(browser).disabled, false)
            assert.equal(browser.document.getElementById("copy-song-button").disabled, false)
            assert.equal(browser.document.getElementById("copy-song-error").hidden, false)
            remove()
            await browser.document.getElementById("copy-song-form").submit()
            assert.equal(browser.screen(), "song")
        } finally {
            remove()
            browser.restore()
        }
    })
}

for (const outcome of ["success", "failure"]) {
    for (const action of ["cancel", "navigate", "account-switch"]) {
        test(`busy copy ignores duplicate submit and late ${outcome} after ${action}`, async () => {
            const { api, source, song } = seed()
            const destination = target(api)
            const started = deferred()
            const response = deferred()
            const remove = api.intercept(request => {
                if (request.path.endsWith("/songs/copy")) {
                    started.resolve()
                    return response.promise
                }
            })
            const { app, browser } = start(api, source, song)
            try {
                await app.ready
                await radio(browser).change(destination)
                const form = browser.document.getElementById("copy-song-form")
                const pending = form.submit()
                await started.promise
                await form.submit()
                assert.equal(api.requests.filter(request => request.path.endsWith("/songs/copy")).length, 1)
                assert.equal(browser.text("copy-song-button"), "Copying…")
                assert.equal(radio(browser).disabled, true)
                if (action === "cancel") {
                    await browser.document.getElementById("cancel-copy-link").click()
                } else if (action === "navigate") {
                    await app.navigate("#/")
                } else {
                    api.signIn("owner@example.com")
                    await app.context.session.load()
                    await app.context.router.render({ focus: true })
                }
                const hash = browser.location.hash
                const screen = browser.screen()
                response.resolve({ status: outcome === "success" ? 201 : 403, body: { id: "late-song" } })
                await pending
                assert.equal(browser.location.hash, hash)
                assert.equal(browser.screen(), screen)
                assert.equal(browser.text("app-status-message"), "")
                if (action === "account-switch") {
                    assert.equal(browser.document.getElementById("copy-song-button").disabled, true)
                    assert.equal(radio(browser).checked, false)
                }
            } finally {
                remove()
                browser.restore()
            }
        })
    }
}

test("401 during destination loading or submission ends the session", async () => {
    for (const stage of ["load", "submit"]) {
        const { api, source, song } = seed()
        target(api)
        const remove = api.intercept(request =>
            (stage === "load" && request.path === "/songbooks") ||
            (stage === "submit" && request.path.endsWith("/songs/copy"))
                ? { status: 401, body: null } : undefined)
        const { app, browser } = start(api, source, song)
        try {
            await app.ready
            if (stage === "submit") {
                await radio(browser).change(radio(browser).dataset.bookId)
                await browser.document.getElementById("copy-song-form").submit()
            }
            assert.equal(app.context.session.state.status, "anonymous")
            assert.equal(browser.document.getElementById("copy-song-form"), null)
        } finally {
            remove()
            browser.restore()
        }
    }
})

for (const action of ["navigate", "account-switch"]) {
    test(`late paged destinations cannot repopulate the screen after ${action}`, async () => {
        const { api, source, song } = seed()
        for (let index = 0; index < 55; index++) target(api, `Z writable ${index}`)
        const started = deferred()
        const response = deferred()
        const remove = api.intercept(request => {
            if (request.path === "/songbooks" && request.query.page === "2") {
                started.resolve()
                return response.promise
            }
        })
        const { app, browser } = start(api, source, song)
        try {
            await app.ready
            const loading = browser.document.getElementById("copy-show-more").click()
            await started.promise
            if (action === "navigate") {
                await app.navigate(`#/books/${source}/songs/${song}`)
            } else {
                api.signIn("owner@example.com")
                await app.context.session.load()
                await app.context.router.render({ focus: true })
            }
            response.resolve({ status: 200, body: {
                page: 2, hasNext: false,
                items: [{ id: "late-private-book", name: "Late private destination", accessLevel: "admin" }]
            } })
            await loading
            assert.equal(browser.text("screen").includes("Late private destination"), false)
            assert.equal(browser.text("app-status-message"), "")
        } finally {
            remove()
            browser.restore()
        }
    })
}

test("destination permission revoked after selection is checked by the API and keeps the picker", async () => {
    const { api, source, song } = seed()
    const destination = target(api)
    const { app, browser } = start(api, source, song)
    try {
        await app.ready
        await radio(browser).change(destination)
        api.seed.access(destination, "reader@example.com", "reader")
        await browser.document.getElementById("copy-song-form").submit()
        assert.equal(browser.screen(), "song-copy")
        assert.equal(radio(browser).checked, true)
        assert.match(browser.text("copy-song-error"), /no longer edit/)
        assert.equal((await (await api.handle({ method: "GET", path: `/songbooks/${destination}/songs` })).json()).items.length, 0)
    } finally {
        browser.restore()
    }
})
