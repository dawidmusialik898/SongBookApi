import assert from "node:assert/strict"
import test from "node:test"

import * as songBooksApi from "../../src/songBooksApi.js"
import { resetAntiforgeryToken } from "../../src/httpClient.js"

test("songBooksApi exports the complete nested resource contract", () => {
    assert.deepEqual(Object.keys(songBooksApi).sort(), [
        "createSongBook",
        "createSongBookPdf",
        "deleteSongBook",
        "downloadSongBookPdf",
        "getSongBook",
        "getSongBookAccess",
        "getSongBookPdfs",
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
        assert.throws(
            () => songBooksApi.getSongBookPdfs(" "),
            TypeError
        )
        assert.throws(
            () => songBooksApi.downloadSongBookPdf("book", ""),
            TypeError
        )
    } finally {
        globalThis.fetch = originalFetch
    }

    assert.equal(calls, 0)
})

test("PDF API pages, generation bodies, and downloads use the nested book URL", async () => {
    const calls = []
    const metadata = {
        id: "pdf / one",
        includeChords: true,
        isWholeBook: true,
        songCount: 2,
        selectedSongs: [],
        generatedAtUtc: "2026-09-30T20:00:00Z",
        isOutdated: false
    }
    const responses = [
        jsonResponse({ items: [metadata], page: 1, hasNext: true }),
        jsonResponse({ items: [], page: 2, hasNext: false }),
        jsonResponse({ token: "pdf-csrf" }),
        jsonResponse(metadata, 201),
        jsonResponse({
            ...metadata,
            includeChords: false,
            isWholeBook: false,
            selectedSongs: [
                { id: "song / one", title: "First" },
                { id: "song-two", title: "Second" }
            ]
        }, 201),
        new Response("%PDF-1.7", {
            headers: { "Content-Type": "application/pdf" }
        })
    ]
    const originalFetch = globalThis.fetch
    globalThis.fetch = async (url, options = {}) => {
        calls.push({
            body: options.body,
            credentials: options.credentials,
            headers: Object.fromEntries(
                new Headers(options.headers ?? {}).entries()
            ),
            method: options.method ?? "GET",
            responseType: options.responseType,
            url: String(url)
        })
        return responses.shift()
    }

    try {
        resetAntiforgeryToken()
        assert.deepEqual(
            await songBooksApi.getSongBookPdfs("book / one"),
            { items: [metadata], page: 1, hasNext: true }
        )
        await songBooksApi.getSongBookPdfs("book / one", 2)
        assert.deepEqual(
            await songBooksApi.createSongBookPdf("book / one", {
                includeChords: true
            }),
            metadata
        )
        await songBooksApi.createSongBookPdf("book / one", {
            includeChords: false,
            songIds: ["song / one", "song-two"]
        })
        const downloaded = await songBooksApi.downloadSongBookPdf(
            "book / one",
            "pdf / one"
        )
        assert.equal(await downloaded.text(), "%PDF-1.7")
        assert.equal(downloaded.type, "application/pdf")
    } finally {
        globalThis.fetch = originalFetch
    }

    assert.deepEqual(calls.map(call => [call.method, call.url]), [
        ["GET", "/songbooks/book%20%2F%20one/pdfs"],
        ["GET", "/songbooks/book%20%2F%20one/pdfs?page=2"],
        ["GET", "/auth/antiforgery"],
        ["POST", "/songbooks/book%20%2F%20one/pdfs"],
        ["POST", "/songbooks/book%20%2F%20one/pdfs"],
        [
            "GET",
            "/songbooks/book%20%2F%20one/pdfs/pdf%20%2F%20one/download"
        ]
    ])
    assert.deepEqual(
        JSON.parse(calls[3].body),
        { includeChords: true }
    )
    assert.deepEqual(
        JSON.parse(calls[4].body),
        {
            includeChords: false,
            songIds: ["song / one", "song-two"]
        }
    )
    assert.equal(calls[3].headers["x-csrf-token"], "pdf-csrf")
    assert.equal(calls[5].credentials, "same-origin")
    assert.equal(calls[5].responseType, undefined)
})

test("PDF generation rejects empty, duplicate, and invalid selections before fetch", () => {
    const originalFetch = globalThis.fetch
    let calls = 0
    globalThis.fetch = async () => {
        calls += 1
        return emptyResponse(204)
    }

    try {
        for (const payload of [
            {},
            { includeChords: "true" },
            { includeChords: true, songIds: [] },
            { includeChords: false, songIds: ["song", "song"] },
            { includeChords: false, songIds: [" "] }
        ]) {
            assert.throws(
                () => songBooksApi.createSongBookPdf("book", payload),
                TypeError
            )
        }
        assert.throws(
            () => songBooksApi.createSongBookPdf("", {
                includeChords: true
            }),
            TypeError
        )
        assert.throws(
            () => songBooksApi.getSongBookPdfs("book", 0),
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
