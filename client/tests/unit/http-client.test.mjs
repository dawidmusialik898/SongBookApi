import assert from "node:assert/strict"
import test from "node:test"

import {
    ApiError,
    request,
    resetAntiforgeryToken
} from "../../src/httpClient.js"

test("request uses same-origin credentials and caches CSRF in memory", async () => {
    const calls = []
    let tokenNumber = 0
    const originalFetch = globalThis.fetch
    globalThis.fetch = async (url, options = {}) => {
        calls.push({
            body: options.body,
            credentials: options.credentials,
            headers: Object.fromEntries(
                new Headers(options.headers ?? {}).entries()
            ),
            method: options.method ?? "GET",
            url: String(url)
        })

        if (url === "/auth/antiforgery") {
            tokenNumber += 1
            return jsonResponse({ token: `csrf-${tokenNumber}` })
        }

        return emptyResponse(204)
    }

    try {
        resetAntiforgeryToken()
        await request("/songs")
        await Promise.all([
            request("/songs", {
                method: "POST",
                json: { title: "One" }
            }),
            request("/songs/one", { method: "DELETE" })
        ])
        resetAntiforgeryToken()
        await request("/auth/logout", { method: "POST" })
    } finally {
        globalThis.fetch = originalFetch
    }

    assert.equal(
        calls.filter(call => call.url === "/auth/antiforgery").length,
        2
    )
    assert.deepEqual(calls[0], {
        body: undefined,
        credentials: "same-origin",
        headers: {},
        method: "GET",
        url: "/songs"
    })
    assert.equal(calls[2].headers["x-csrf-token"], "csrf-1")
    assert.equal(calls[3].headers["x-csrf-token"], "csrf-1")
    assert.equal(calls[2].headers["content-type"], "application/json")
    assert.equal(calls[3].headers["content-type"], undefined)
    assert.equal(calls[5].headers["x-csrf-token"], "csrf-2")
})

test("request preserves structured HTTP and network errors", async () => {
    const originalFetch = globalThis.fetch

    try {
        globalThis.fetch = async () => jsonResponse(
            { title: "Denied" },
            403,
            "application/problem+json"
        )
        await assert.rejects(
            request("/songs"),
            error => {
                assert.equal(error instanceof ApiError, true)
                assert.equal(error.status, 403)
                assert.deepEqual(error.details, { title: "Denied" })
                return true
            }
        )

        const cause = new TypeError("network")
        globalThis.fetch = async () => {
            throw cause
        }
        await assert.rejects(
            request("/songs"),
            error => {
                assert.equal(error instanceof ApiError, true)
                assert.equal(error.status, null)
                assert.equal(error.cause, cause)
                return true
            }
        )
    } finally {
        globalThis.fetch = originalFetch
    }
})

function jsonResponse(
    body,
    status = 200,
    contentType = "application/json"
) {
    return new Response(JSON.stringify(body), {
        headers: { "Content-Type": contentType },
        status
    })
}

function emptyResponse(status) {
    return new Response(null, { status })
}
