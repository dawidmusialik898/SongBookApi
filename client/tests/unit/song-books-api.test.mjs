import assert from "node:assert/strict"
import test from "node:test"

import * as songBooksApi from "../../src/songBooksApi.js"
import { resetAntiforgeryToken } from "../../src/httpClient.js"

test("songBooksApi exports the complete nested resource contract", () => {
    assert.deepEqual(Object.keys(songBooksApi).sort(), [
        "createSongBook",
        "deleteSongBook",
        "getSongBook",
        "getSongBookAccess",
        "getSongBooks",
        "removeSongBookAccess",
        "renameSongBook",
        "setSongBookAccess"
    ])
})

test("songBooksApi maps methods, encoded IDs, and JSON bodies", async () => {
    const calls = []
    const responses = [
        jsonResponse({ items: [], page: 1, hasNext: false }),
        jsonResponse({ token: "book-csrf" }),
        jsonResponse({ id: "book / one", name: "Created" }, 201),
        jsonResponse({ id: "book / one", name: "Created" }),
        emptyResponse(204),
        emptyResponse(204),
        jsonResponse({ items: [], page: 1, hasNext: false }),
        jsonResponse({
            id: "access / one",
            email: "reader@example.com",
            accessLevel: "reader"
        }),
        emptyResponse(204)
    ]
    const originalFetch = globalThis.fetch
    globalThis.fetch = async (url, options = {}) => {
        calls.push({
            body: options.body,
            method: options.method ?? "GET",
            url: String(url)
        })
        return responses.shift()
    }

    const bookPayload = { name: "Created" }
    const accessPayload = {
        email: "reader@example.com",
        accessLevel: "reader"
    }

    try {
        resetAntiforgeryToken()
        await songBooksApi.getSongBooks()
        await songBooksApi.createSongBook(bookPayload)
        await songBooksApi.getSongBook("book / one")
        await songBooksApi.renameSongBook("book / one", bookPayload)
        await songBooksApi.deleteSongBook("book / one")
        await songBooksApi.getSongBookAccess("book / one")
        await songBooksApi.setSongBookAccess(
            "book / one",
            accessPayload
        )
        await songBooksApi.removeSongBookAccess(
            "book / one",
            "access / one"
        )
    } finally {
        globalThis.fetch = originalFetch
    }

    assert.deepEqual(
        calls.map(call => [call.method, call.url]),
        [
            ["GET", "/songbooks"],
            ["GET", "/auth/antiforgery"],
            ["POST", "/songbooks"],
            ["GET", "/songbooks/book%20%2F%20one"],
            ["PUT", "/songbooks/book%20%2F%20one"],
            ["DELETE", "/songbooks/book%20%2F%20one"],
            ["GET", "/songbooks/book%20%2F%20one/access"],
            ["PUT", "/songbooks/book%20%2F%20one/access"],
            [
                "DELETE",
                "/songbooks/book%20%2F%20one/access/access%20%2F%20one"
            ]
        ]
    )
    assert.equal(calls[2].body, JSON.stringify(bookPayload))
    assert.equal(calls[4].body, JSON.stringify(bookPayload))
    assert.equal(calls[7].body, JSON.stringify(accessPayload))
})

test("songBooksApi rejects blank resource IDs before fetch", () => {
    const originalFetch = globalThis.fetch
    let calls = 0
    globalThis.fetch = async () => {
        calls += 1
        return emptyResponse(204)
    }

    try {
        assert.throws(() => songBooksApi.getSongBook(), TypeError)
        assert.throws(
            () => songBooksApi.renameSongBook(" ", {}),
            TypeError
        )
        assert.throws(
            () => songBooksApi.removeSongBookAccess("book", ""),
            TypeError
        )
    } finally {
        globalThis.fetch = originalFetch
    }

    assert.equal(calls, 0)
})

function jsonResponse(body, status = 200) {
    return new Response(JSON.stringify(body), {
        headers: { "Content-Type": "application/json" },
        status
    })
}

function emptyResponse(status) {
    return new Response(null, { status })
}
