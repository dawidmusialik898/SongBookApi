import assert from "node:assert/strict"
import test from "node:test"

import {
    createSong,
    deleteSong,
    getSong,
    getSongs,
    updateSong
} from "../../src/songsApi.js"
import {
    ApiError,
    resetAntiforgeryToken
} from "../../src/httpClient.js"

const SONG_BOOK_ID = "book / one"
const SONGS_API_URL = "/songbooks/book%20%2F%20one/songs"

test("songsApi exports exactly the supported runtime API", async () => {
    const api = await import("../../src/songsApi.js")

    assert.deepEqual(Object.keys(api).sort(), [
        "createSong",
        "deleteSong",
        "getSong",
        "getSongs",
        "updateSong"
    ])
})

test("endpoint wrappers map methods, encoded IDs, bodies, and responses", async () => {
    const requests = []
    const responses = [
        jsonResponse([{ id: "song-1" }]),
        jsonResponse({ id: "song / one" }),
        jsonResponse({ token: "csrf-token" }),
        jsonResponse({ id: "song-2", title: "Created" }, 201),
        emptyResponse(204),
        emptyResponse(204)
    ]
    const originalFetch = globalThis.fetch
    globalThis.fetch = async (url, options = {}) => {
        requests.push({
            body: options.body,
            credentials: options.credentials,
            headers: Object.fromEntries(
                new Headers(options.headers ?? {}).entries()
            ),
            method: options.method ?? "GET",
            url: String(url)
        })
        return responses.shift()
    }

    const payload = {
        title: "Created",
        parts: []
    }

    try {
        resetAntiforgeryToken()
        assert.deepEqual(
            await getSongs(SONG_BOOK_ID),
            [{ id: "song-1" }]
        )
        assert.deepEqual(
            await getSong(SONG_BOOK_ID, "song / one"),
            { id: "song / one" }
        )
        assert.deepEqual(
            await createSong(SONG_BOOK_ID, payload),
            { id: "song-2", title: "Created" }
        )
        assert.equal(
            await updateSong(SONG_BOOK_ID, "song / one", payload),
            undefined
        )
        assert.equal(
            await deleteSong(SONG_BOOK_ID, "song / one"),
            undefined
        )
    } finally {
        globalThis.fetch = originalFetch
    }

    assert.deepEqual(requests, [
        {
            body: undefined,
            credentials: "same-origin",
            headers: {},
            method: "GET",
            url: SONGS_API_URL
        },
        {
            body: undefined,
            credentials: "same-origin",
            headers: {},
            method: "GET",
            url: `${SONGS_API_URL}/song%20%2F%20one`
        },
        {
            body: undefined,
            credentials: "same-origin",
            headers: {},
            method: "GET",
            url: "/auth/antiforgery"
        },
        {
            body: JSON.stringify(payload),
            credentials: "same-origin",
            headers: {
                "content-type": "application/json",
                "x-csrf-token": "csrf-token"
            },
            method: "POST",
            url: SONGS_API_URL
        },
        {
            body: JSON.stringify(payload),
            credentials: "same-origin",
            headers: {
                "content-type": "application/json",
                "x-csrf-token": "csrf-token"
            },
            method: "PUT",
            url: `${SONGS_API_URL}/song%20%2F%20one`
        },
        {
            body: undefined,
            credentials: "same-origin",
            headers: {
                "x-csrf-token": "csrf-token"
            },
            method: "DELETE",
            url: `${SONGS_API_URL}/song%20%2F%20one`
        }
    ])
})

test("HTTP and network failures produce inspectable ApiError values", async () => {
    const originalFetch = globalThis.fetch

    try {
        globalThis.fetch = async () => jsonResponse(
            {
                title: "Not found"
            },
            404,
            "application/problem+json"
        )

        await assert.rejects(
            getSong("book", "missing"),
            error => {
                assert.equal(error instanceof ApiError, true)
                assert.equal(error.name, "ApiError")
                assert.equal(error.status, 404)
                assert.deepEqual(error.details, {
                    title: "Not found"
                })
                assert.match(error.message, /404/)
                return true
            }
        )

        globalThis.fetch = async () => textResponse(
            "Service unavailable",
            503
        )

        await assert.rejects(
            getSongs("book"),
            error => {
                assert.equal(error instanceof ApiError, true)
                assert.equal(error.status, 503)
                assert.equal(error.details, "Service unavailable")
                return true
            }
        )

        const networkError = new TypeError("fetch failed")
        globalThis.fetch = async () => {
            throw networkError
        }

        await assert.rejects(
            getSongs("book"),
            error => {
                assert.equal(error instanceof ApiError, true)
                assert.equal(error.status, null)
                assert.equal(error.details, null)
                assert.equal(error.cause, networkError)
                return true
            }
        )
    } finally {
        globalThis.fetch = originalFetch
    }
})

test("individual endpoints reject missing or blank IDs before fetch", async () => {
    const originalFetch = globalThis.fetch
    let fetchCalls = 0
    globalThis.fetch = async () => {
        fetchCalls += 1
        return emptyResponse(204)
    }

    try {
        assert.throws(() => getSongs(), TypeError)
        assert.throws(() => getSong("book"), TypeError)
        assert.throws(() => getSong("   ", "song"), TypeError)
        assert.throws(() => updateSong("book", null, {}), TypeError)
        assert.throws(() => deleteSong("", "song"), TypeError)
    } finally {
        globalThis.fetch = originalFetch
    }

    assert.equal(fetchCalls, 0)
})

test("successful non-JSON responses return undefined", async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = async () => textResponse("Accepted", 202)

    try {
        assert.equal(await getSongs("book"), undefined)
    } finally {
        globalThis.fetch = originalFetch
    }
})

function jsonResponse(body, status = 200, contentType = "application/json") {
    return new Response(
        JSON.stringify(body),
        {
            headers: {
                "Content-Type": contentType
            },
            status
        }
    )
}

function textResponse(body, status) {
    return new Response(
        body,
        {
            headers: {
                "Content-Type": "text/plain"
            },
            status
        }
    )
}

function emptyResponse(status) {
    return new Response(null, { status })
}
