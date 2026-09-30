import assert from "node:assert/strict"
import test from "node:test"

import {
    deleteManagedUser,
    getManagedUsers,
    setManagedUserBan,
    setManagedUserRole
} from "../../src/moderationApi.js"
import { resetAntiforgeryToken } from "../../src/httpClient.js"

test("moderation requests are relative and authenticated mutations use CSRF", async () => {
    const calls = []
    const originalFetch = globalThis.fetch
    globalThis.fetch = async (url, options = {}) => {
        calls.push({
            body: options.body ?? null,
            credentials: options.credentials,
            headers: Object.fromEntries(
                new Headers(options.headers ?? {}).entries()
            ),
            method: options.method ?? "GET",
            url: String(url)
        })

        if (url === "/auth/antiforgery") {
            return new Response(JSON.stringify({ token: "moderation-csrf" }), {
                headers: { "Content-Type": "application/json" }
            })
        }

        if (url === "/admin/users") {
            return new Response("[]", {
                headers: { "Content-Type": "application/json" }
            })
        }

        return new Response(null, { status: 204 })
    }

    try {
        resetAntiforgeryToken()
        assert.deepEqual(await getManagedUsers(), [])
        await setManagedUserRole("user-1", "moderator")
        await setManagedUserBan("user-1", true)
        await deleteManagedUser("user-1")
    } finally {
        globalThis.fetch = originalFetch
        resetAntiforgeryToken()
    }

    assert.deepEqual(
        calls.map(call => [call.method, call.url]),
        [
            ["GET", "/admin/users"],
            ["GET", "/auth/antiforgery"],
            ["PUT", "/admin/users/user-1/role"],
            ["PUT", "/admin/users/user-1/ban"],
            ["DELETE", "/admin/users/user-1"]
        ]
    )
    assert.deepEqual(JSON.parse(calls[2].body), { role: "moderator" })
    assert.deepEqual(JSON.parse(calls[3].body), { isBanned: true })
    for (const call of calls) {
        assert.equal(call.credentials, "same-origin")
    }
    for (const call of calls.slice(2)) {
        assert.equal(call.headers["x-csrf-token"], "moderation-csrf")
    }
})

test("user-management adapter rejects blank IDs", () => {
    assert.throws(
        () => setManagedUserRole(" ", "moderator"),
        /User id must not be blank/
    )
    assert.throws(
        () => setManagedUserBan(null, true),
        /User id must not be blank/
    )
    assert.throws(
        () => deleteManagedUser(undefined),
        /User id must not be blank/
    )
})
