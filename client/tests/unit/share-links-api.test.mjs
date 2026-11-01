import assert from "node:assert/strict"
import test from "node:test"
import { createSharedReadApi } from "../../src/shareLinksApi.js"
import { buildHref, parseLocation, resolveRoute } from "../../src/routes.js"

test("every public read including download carries the token only in a no-store header", async () => {
    const original = globalThis.fetch
    const calls = []
    const controller = new AbortController()
    globalThis.fetch = async (url, options) => {
        calls.push({ url, options })
        return url.endsWith("/download")
            ? new Response("%PDF-test", { headers: { "Content-Type": "application/pdf" } })
            : new Response("{}", { headers: { "Content-Type": "application/json" } })
    }
    try {
        const api = createSharedReadApi("book id", "secret-token")
        await api.getSongBook("ignored", { signal: controller.signal })
        await api.getSongs("ignored", 1, { search: "Some song", signal: controller.signal })
        await api.getSongs("ignored", 2)
        await api.getSong("ignored", "song id")
        await api.getAdjacentSongs("ignored", "song id")
        await api.getSongBookPdfs("ignored", 2)
        await api.downloadSongBookPdf("ignored", "pdf id")
        assert.equal(calls[1].url, "/shared/songbooks/book%20id/songs?search=Some+song")
        assert.equal(calls[2].url, "/shared/songbooks/book%20id/songs?page=2")
        assert.equal(calls[0].options.signal, controller.signal)
        for (const { url, options } of calls) {
            assert.equal(url.includes("secret-token"), false)
            assert.equal(options.headers.get("X-SongBook-Share-Token"), "secret-token")
            assert.equal(options.cache, "no-store")
            assert.equal(options.referrerPolicy, "no-referrer")
            assert.equal(options.method, "GET")
        }
    } finally { globalThis.fetch = original }
})

test("capability routes preserve encoded IDs/tokens in fragments without exposing private routes", () => {
    const href = buildHref("shared-book", { bookId: "a/b", token: "secret-token" }, { q: "some song" })
    assert.equal(href, "#/shared/books/a%2Fb/secret-token?q=some%20song")
    const resolved = resolveRoute(parseLocation(href))
    assert.equal(resolved.route.publicRead, true)
    assert.deepEqual(resolved.params, { bookId: "a/b", token: "secret-token" })
    assert.deepEqual(resolved.query, { q: "some song" })
    for (const tail of ["/history", "/share", "/songs/id/edit", "/pdfs/new"]) {
        const candidate = resolveRoute(parseLocation(`#/shared/books/id/token${tail}`))
        assert.equal(candidate.route.publicRead, undefined)
    }
})
