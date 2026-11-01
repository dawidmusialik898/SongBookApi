import assert from "node:assert/strict"
import test from "node:test"
import { createAppHarness } from "../helpers/appHarness.mjs"
import { createFakeApi } from "../helpers/fakeApi.mjs"
import { getSong, getSongSnapshot, updateSong } from "../../src/songsApi.js"

async function raw(api, path, method = "GET", body) {
    return api.handle({ path, method, body, headers: { "X-CSRF-TOKEN": "test-antiforgery-token" } })
}

async function setup({ deleted = false, updates = 1 } = {}) {
    const api = createFakeApi()
    api.seed.account("owner@example.com")
    const bookId = api.seed.book({ owner: "owner@example.com", name: "History book" })
    api.signIn("owner@example.com")
    const response = await raw(api, `/songbooks/${bookId}/songs`, "POST", {
        title: "<img src=x onerror=alert(1)>", author: "Original author",
        parts: [{ name: "Verse", text: "😀old\nsame", chords: [{ offset: 0, symbol: "Am" }] }]
    })
    const song = await response.json()
    const songId = song.id
    const path = `/songbooks/${bookId}/songs/${songId}`
    for (let index = 0; index < updates; index++) {
        await raw(api, path, "PUT", { title: `Updated ${index + 1}`,
            parts: [{ id: song.parts[0].id, name: "Verse", text: "😀new\nsame", chords: [{ offset: 0, symbol: "C" }] }] })
    }
    if (deleted) await raw(api, path, "DELETE")
    return { api, bookId, songId, path, original: song }
}

function selectRevision(browser, revision) {
    return browser.document.getElementById("history-revision").change(String(revision))
}

function hasTag(node, tag) {
    return node.tagName === tag || (node.children ?? []).some(child => hasTag(child, tag))
}

test("book feed exposes deleted recovery and filters collaborator events for readers", async () => {
    const { api, bookId, songId } = await setup({ deleted: true })
    api.seed.account("reader@example.com")
    await raw(api, `/songbooks/${bookId}/access`, "PUT", { email: "reader@example.com", accessLevel: "reader" })
    const { app, browser } = createAppHarness(api, { initialUrl: `https://localhost/#/books/${bookId}/history` })
    try {
        await app.ready
        assert.equal(browser.screen(), "history")
        assert.match(browser.text("history-list"), /collaborator.added/)
        const recovery = browser.document.getElementById("history-list").children
            .find(row => /recover deleted/.test(row.textContent)).children.find(child => child.tagName === "A")
        assert.equal(recovery.getAttribute("href"), `#/books/${bookId}/songs/${songId}/history`)
        api.signIn("reader@example.com")
        await app.navigate(`#/books/${bookId}/history`)
        assert.doesNotMatch(browser.text("history-list"), /collaborator.added/)
        assert.match(browser.text("history-list"), /song.deleted/)
    } finally { browser.restore() }
})

test("revision dropdown previews text literally, and restore requires confirmation", async () => {
    const { api, bookId, songId, path, original } = await setup()
    const { app, browser } = createAppHarness(api, { initialUrl: `https://localhost/#/books/${bookId}/songs/${songId}/history` })
    try {
        await app.ready
        assert.equal(browser.text("screen-heading"), "Song history")
        assert.match(browser.text("history-preview"), /Updated 1/)
        assert.equal(browser.document.getElementById("history-revision").value, "2")
        assert.equal(hasTag(browser.document.getElementById("history-list"), "BUTTON"), false)
        assert.equal(browser.document.getElementById("history-compare-link").getAttribute("href"),
            `#/books/${bookId}/songs/${songId}/history/compare`)
        await selectRevision(browser, 1)
        assert.match(browser.text("history-preview"), /<img src=x onerror=alert\(1\)>/)
        assert.equal(hasTag(browser.document.getElementById("history-preview"), "IMG"), false)
        const cancelled = browser.document.getElementById("history-restore").click()
        await browser.settle()
        assert.match(browser.text("dialog-message"), /revision 1 over latest revision 2/)
        await browser.document.getElementById("dialog-cancel").click()
        await cancelled
        assert.equal(api.requests.filter(request => request.path.endsWith("/restore")).length, 0)
        const restoring = browser.document.getElementById("history-restore").click()
        await browser.settle()
        await browser.document.getElementById("dialog-confirm").click()
        await restoring
        assert.equal(browser.screen(), "song")
        assert.equal(browser.text("screen-heading"), original.title)
        const song = await getSong(bookId, songId)
        assert.equal(song.revision, 3)
        assert.deepEqual(song.parts, original.parts)
        const request = api.requests.find(request => request.path === `${path}/history/1/restore`)
        assert.deepEqual(request.body, { expectedRevision: 2 })
        assert.equal(request.headers["x-csrf-token"], "test-antiforgery-token")
        assert.equal((await getSongSnapshot(bookId, songId, 1)).snapshot.song.title, original.title)
    } finally { browser.restore() }
})

test("compare screen is separate, defaults to the latest change and renders diffs literally", async () => {
    const { api, bookId, songId, original } = await setup({ updates: 2 })
    const { app, browser } = createAppHarness(api, { initialUrl: `https://localhost/#/books/${bookId}/songs/${songId}/history/compare` })
    try {
        await app.ready
        assert.equal(browser.screen(), "history-compare")
        assert.equal(browser.document.getElementById("history-preview"), null)
        assert.equal(browser.document.getElementById("history-compare-before").value, "2")
        assert.equal(browser.document.getElementById("history-compare-after").value, "3")
        assert.match(browser.text("history-compare-result"), /Changes from revision 2 to 3/)
        await browser.document.getElementById("history-compare-before").change("1")
        await browser.document.getElementById("history-compare").click()
        const result = browser.document.getElementById("history-compare-result")
        assert.match(browser.text("history-compare-result"), /Changes from revision 1 to 3/)
        assert.match(browser.text("history-compare-result"), /Song details/)
        assert.match(browser.text("history-compare-result"), /Verse/)
        assert.match(browser.text("history-compare-result"), /Before/)
        assert.match(browser.text("history-compare-result"), /<img src=x onerror=alert\(1\)>/)
        assert.doesNotMatch(browser.text("history-compare-result"), new RegExp(original.parts[0].id))
        assert.equal(hasTag(result, "IMG"), false)
        assert.equal(hasTag(result, "INS"), true)
        assert.equal(hasTag(result, "DEL"), true)
        assert.equal(api.requests.filter(request => request.path.endsWith("/restore")).length, 0)
        assert.equal(browser.document.getElementById("history-compare-back").getAttribute("href"),
            `#/books/${bookId}/songs/${songId}/history`)
    } finally { browser.restore() }
})

test("deleted song recovery retains logical ID, parts and old revisions", async () => {
    const { api, bookId, songId, original } = await setup({ deleted: true })
    const { app, browser } = createAppHarness(api, { initialUrl: `https://localhost/#/books/${bookId}/songs/${songId}/history` })
    try {
        await app.ready
        assert.match(browser.text("history-notice"), /deleted/)
        await selectRevision(browser, 1)
        const recovering = browser.document.getElementById("history-restore").click()
        await browser.settle()
        assert.equal(browser.text("dialog-title"), "Recover deleted song?")
        await browser.document.getElementById("dialog-confirm").click()
        await recovering
        const recovered = await getSong(bookId, songId)
        assert.equal(recovered.id, songId)
        assert.equal(recovered.revision, 4)
        assert.deepEqual(recovered.parts, original.parts)
        assert.equal((await getSongSnapshot(bookId, songId, 3)).summary.operation, "song.deleted")
    } finally { browser.restore() }
})

test("readers inspect snapshots but never see a restore control", async () => {
    const { api, bookId, songId } = await setup()
    api.seed.account("reader@example.com")
    api.seed.access(bookId, "reader@example.com", "reader")
    api.signIn("reader@example.com")
    const { app, browser } = createAppHarness(api, { initialUrl: `https://localhost/#/books/${bookId}/songs/${songId}/history` })
    try {
        await app.ready
        assert.match(browser.text("history-preview"), /Updated/)
        assert.equal(browser.document.getElementById("history-restore").hidden, true)
        await browser.document.getElementById("history-restore").click()
        assert.equal(api.requests.filter(request => request.path.endsWith("/restore")).length, 0)
    } finally { browser.restore() }
})

test("paging loads revision summaries and fetches snapshots only on demand", async () => {
    const { api, bookId, songId } = await setup({ updates: 51 })
    const { app, browser } = createAppHarness(api, { initialUrl: `https://localhost/#/books/${bookId}/songs/${songId}/history` })
    try {
        await app.ready
        assert.equal(browser.document.getElementById("history-list").children.length, 50)
        assert.equal(api.requests.filter(request => /\/history\/\d+$/.test(request.path)).length, 1)
        await browser.document.getElementById("history-more").click()
        assert.equal(browser.document.getElementById("history-list").children.length, 52)
        assert.equal(browser.document.getElementById("history-more").hidden, true)
        await selectRevision(browser, 1)
        assert.match(browser.text("history-preview"), /<img/)
    } finally { browser.restore() }
})

test("stale restore does not overwrite newer content and reloads history explicitly", async () => {
    const { api, bookId, songId } = await setup()
    const { app, browser } = createAppHarness(api, { initialUrl: `https://localhost/#/books/${bookId}/songs/${songId}/history` })
    try {
        await app.ready
        await selectRevision(browser, 1)
        await updateSong(bookId, songId, { title: "Concurrent update", expectedRevision: 2, parts: [] })
        const restoring = browser.document.getElementById("history-restore").click()
        await browser.settle()
        await browser.document.getElementById("dialog-confirm").click()
        await restoring
        assert.equal(browser.screen(), "history")
        assert.match(browser.text("history-feedback"), /changed/)
        assert.equal((await getSong(bookId, songId)).title, "Concurrent update")
        await browser.document.getElementById("history-feedback").children.find(child => child.tagName === "BUTTON").click()
        assert.match(browser.text("history-preview"), /Concurrent update/)
    } finally { browser.restore() }
})

test("failed and duplicate restore submissions remain safe and retryable", async () => {
    const { api, bookId, songId } = await setup()
    const remove = api.intercept(request => request.path.endsWith("/restore") ? { status: 500, body: null } : undefined)
    const { app, browser } = createAppHarness(api, { initialUrl: `https://localhost/#/books/${bookId}/songs/${songId}/history` })
    try {
        await app.ready
        const restoring = browser.document.getElementById("history-restore").click()
        await browser.settle()
        await browser.document.getElementById("history-restore").click()
        await browser.document.getElementById("dialog-confirm").click()
        await restoring
        assert.equal(api.requests.filter(request => request.path.endsWith("/restore")).length, 1)
        assert.match(browser.text("history-feedback"), /could not/)
        assert.equal(browser.document.getElementById("history-restore").disabled, false)
        remove()
    } finally { browser.restore() }
})

test("late snapshots cannot replace a newer preview or a navigated screen", async () => {
    const { api, bookId, songId, path } = await setup()
    let resolve, startedResolve
    const started = new Promise(done => { startedResolve = done })
    const remove = api.intercept(request => {
        if (request.path === `${path}/history/1`) {
            startedResolve()
            return new Promise(done => { resolve = done })
        }
        return undefined
    })
    const { app, browser } = createAppHarness(api, { initialUrl: `https://localhost/#/books/${bookId}/songs/${songId}/history` })
    try {
        await app.ready
        const oldPreview = selectRevision(browser, 1)
        await started
        await selectRevision(browser, 2)
        resolve({ status: 200, body: { snapshot: { song: { title: "Late private text", parts: [] } } } })
        await oldPreview
        assert.doesNotMatch(browser.text("history-preview"), /Late private/)
        await app.navigate(`#/books/${bookId}`)
        assert.equal(browser.screen(), "book")
        assert.doesNotMatch(browser.text("screen"), /Late private/)
    } finally { resolve?.({ status: 200, body: null }); remove(); browser.restore() }
})

test("history 401 ends the session and removes private content", async () => {
    const { api, bookId, songId, path } = await setup()
    api.intercept(request => request.path === `${path}/history` ? { status: 401, body: null } : undefined)
    const { app, browser } = createAppHarness(api, { initialUrl: `https://localhost/#/books/${bookId}/songs/${songId}/history` })
    try {
        await app.ready
        assert.equal(browser.screen(), "auth")
        assert.doesNotMatch(browser.text("screen"), /Updated 1/)
    } finally { browser.restore() }
})

test("pending private snapshot is aborted and cannot render after an account switch", async () => {
    const { api, bookId, songId, path } = await setup()
    api.seed.account("reader@example.com")
    api.seed.access(bookId, "reader@example.com", "reader")
    let release, markStarted
    const started = new Promise(resolve => { markStarted = resolve })
    const remove = api.intercept(request => {
        if (request.path === `${path}/history/1`) {
            markStarted()
            return new Promise(resolve => { release = resolve })
        }
        return undefined
    })
    const { app, browser } = createAppHarness(api, { initialUrl: `https://localhost/#/books/${bookId}/songs/${songId}/history` })
    try {
        await app.ready
        const pending = selectRevision(browser, 1)
        await started
        api.signIn("reader@example.com")
        await app.context.session.load()
        await app.context.router.render({ focus: true })
        release({ status: 200, body: { snapshot: { song: { title: "Late owner content", parts: [] } } } })
        await pending
        assert.doesNotMatch(browser.text("screen"), /Late owner content/)
        assert.equal(browser.document.getElementById("history-restore").hidden, true)
    } finally { release?.({ status: 200, body: null }); remove(); browser.restore() }
})

test("a late restore response cannot navigate or show a success message after account switching", async () => {
    const { api, bookId, songId } = await setup()
    api.seed.account("reader@example.com")
    api.seed.access(bookId, "reader@example.com", "reader")
    let release, markStarted
    const started = new Promise(resolve => { markStarted = resolve })
    const remove = api.intercept(request => {
        if (request.path.endsWith("/restore")) {
            markStarted()
            return new Promise(resolve => { release = resolve })
        }
        return undefined
    })
    const { app, browser } = createAppHarness(api, { initialUrl: `https://localhost/#/books/${bookId}/songs/${songId}/history` })
    try {
        await app.ready
        const restoring = browser.document.getElementById("history-restore").click()
        await browser.settle()
        await browser.document.getElementById("dialog-confirm").click()
        await started
        api.signIn("reader@example.com")
        await app.context.session.load()
        await app.context.router.render({ focus: true })
        release({ status: 200, body: { id: songId, revision: 3 } })
        await restoring
        assert.equal(browser.screen(), "history")
        assert.equal(browser.document.getElementById("history-restore").hidden, true)
        assert.doesNotMatch(browser.text("app-status-message"), /restored/)
    } finally { release?.({ status: 200, body: null }); remove(); browser.restore() }
})
