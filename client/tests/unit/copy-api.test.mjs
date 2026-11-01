import assert from "node:assert/strict"
import test from "node:test"
import { copySong } from "../../src/songsApi.js"
import { resetAntiforgeryToken } from "../../src/httpClient.js"
import { createFakeApi } from "../helpers/fakeApi.mjs"

test("copy adapter encodes destination, sends only source IDs with antiforgery and abort signal", async () => {
    const requests = []
    const original = globalThis.fetch
    const signal = new AbortController().signal
    globalThis.fetch = async (url, options) => {
        requests.push({ url, options })
        return new Response(JSON.stringify(url === "/auth/antiforgery"
            ? { token: "csrf" } : { id: "copied" }), {
            status: url === "/auth/antiforgery" ? 200 : 201,
            headers: { "Content-Type": "application/json" }
        })
    }
    try {
        resetAntiforgeryToken()
        assert.deepEqual(await copySong("dest / one", "source / one", "song / one", { signal }), { id: "copied" })
        assert.equal(requests[1].url, "/songbooks/dest%20%2F%20one/songs/copy")
        assert.equal(requests[1].options.method, "POST")
        assert.equal(requests[1].options.credentials, "same-origin")
        assert.equal(requests[1].options.signal, signal)
        assert.equal(new Headers(requests[1].options.headers).get("x-csrf-token"), "csrf")
        assert.deepEqual(JSON.parse(requests[1].options.body), { sourceBookId: "source / one", sourceSongId: "song / one" })
        for (const ids of [["", "source", "song"], ["dest", "", "song"], ["dest", "source", ""]]) {
            assert.throws(() => copySong(...ids), TypeError)
        }
    } finally {
        globalThis.fetch = original
        resetAntiforgeryToken()
    }
})

test("fake copy enforces membership, same-book, wrong-book and antiforgery and remains independent", async () => {
    const api = createFakeApi()
    api.seed.account("owner@example.com")
    api.seed.account("reader@example.com")
    api.seed.account("outsider@example.com")
    const source = api.seed.book({ owner: "owner@example.com", name: "Source" })
    const destination = api.seed.book({ owner: "owner@example.com", name: "Destination" })
    const song = api.seed.song(source, { title: "Duplicate", number: "1", parts: [{ text: "😀exact\r\n", chords: [{ offset: 0, symbol: "C" }] }] })
    const headers = { "X-CSRF-TOKEN": "test-antiforgery-token" }
    const body = { sourceBookId: source, sourceSongId: song }
    const send = (book = destination, payload = body, csrf = headers) => api.handle({ method: "POST", path: `/songbooks/${book}/songs/copy`, body: payload, headers: csrf })
    assert.equal((await send()).status, 401)
    api.signIn("outsider@example.com")
    assert.equal((await send()).status, 404)
    api.signIn("reader@example.com")
    api.seed.access(source, "reader@example.com", "reader")
    api.seed.access(destination, "reader@example.com", "reader")
    assert.equal((await send()).status, 403)
    api.seed.access(destination, "reader@example.com", "editor")
    assert.equal((await send(destination, body, {})).status, 400)
    assert.equal((await send(source)).status, 400)
    assert.equal((await send(destination, { ...body, sourceSongId: "missing" })).status, 404)
    assert.equal((await send(destination, { ...body, sourceBookId: "missing" })).status, 404)
    assert.equal((await send(destination, {})).status, 400)
    const first = await send()
    assert.equal(first.status, 201)
    const copy = await first.json()
    assert.equal(first.headers.get("location"), `/songbooks/${destination}/songs/${copy.id}`)
    assert.equal((await send()).status, 201)
    assert.equal((await send(source, { sourceBookId: destination, sourceSongId: copy.id })).status, 403)
    const get = async (book, id) => (await api.handle({ method: "GET", path: `/songbooks/${book}/songs/${id}` })).json()
    const original = await get(source, song)
    assert.notEqual(original.parts[0].id, copy.parts[0].id)
    assert.deepEqual(original.parts[0].chords, copy.parts[0].chords)
    const updated = await api.handle({ method: "PUT", path: `/songbooks/${destination}/songs/${copy.id}`,
        headers, body: { title: "Changed", parts: [] } })
    assert.equal(updated.status, 204)
    assert.deepEqual(await get(source, song), original)
    api.signIn("owner@example.com")
    assert.equal((await api.handle({ method: "DELETE", path: `/songbooks/${source}/songs/${song}`, headers })).status, 204)
    assert.equal((await get(destination, copy.id)).title, "Changed")
})
