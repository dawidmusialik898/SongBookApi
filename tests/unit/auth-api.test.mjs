import assert from "node:assert/strict"
import test from "node:test"

import * as authApi from "../../src/authApi.js"
import { resetAntiforgeryToken } from "../../src/httpClient.js"

test("authApi exports exact relative endpoint wrappers", async () => {
    assert.deepEqual(Object.keys(authApi).sort(), [
        "getCurrentUser",
        "login",
        "logout",
        "registerAccount",
        "requestPasswordReset",
        "resendConfirmation",
        "resetPassword"
    ])

    const calls = []
    const originalFetch = globalThis.fetch
    globalThis.fetch = async (url, options = {}) => {
        calls.push({
            body: options.body,
            method: options.method ?? "GET",
            url: String(url)
        })

        if (url === "/auth/antiforgery") {
            return jsonResponse({ token: "auth-csrf" })
        }

        if (url === "/auth/me") {
            return jsonResponse({
                isAuthenticated: false,
                email: null
            })
        }

        return new Response(null, { status: 204 })
    }

    try {
        resetAntiforgeryToken()
        await authApi.getCurrentUser()
        await authApi.registerAccount({
            email: "user@example.com",
            password: "long password"
        })
        await authApi.login({
            email: "user@example.com",
            password: "long password",
            rememberMe: false
        })
        await authApi.logout()
        await authApi.resendConfirmation("user@example.com")
        await authApi.requestPasswordReset("user@example.com")
        await authApi.resetPassword({
            email: "user@example.com",
            code: "code",
            newPassword: "new long password"
        })
    } finally {
        globalThis.fetch = originalFetch
    }

    assert.deepEqual(
        calls.map(call => [call.method, call.url]),
        [
            ["GET", "/auth/me"],
            ["GET", "/auth/antiforgery"],
            ["POST", "/auth/register"],
            ["POST", "/auth/login"],
            ["POST", "/auth/logout"],
            ["POST", "/auth/resend-confirmation"],
            ["POST", "/auth/forgot-password"],
            ["POST", "/auth/reset-password"]
        ]
    )
    assert.deepEqual(
        JSON.parse(calls.at(-1).body),
        {
            email: "user@example.com",
            code: "code",
            newPassword: "new long password"
        }
    )
})

function jsonResponse(body) {
    return new Response(JSON.stringify(body), {
        headers: { "Content-Type": "application/json" }
    })
}
