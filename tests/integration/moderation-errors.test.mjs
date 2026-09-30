import assert from "node:assert/strict"
import test from "node:test"

import { installTestBrowser } from "../helpers/testBrowser.mjs"

test("user-list and ban failures stay truthful and retryable", async () => {
    let listFails = true
    let resolveBan
    const delayedBan = new Promise(resolve => {
        resolveBan = resolve
    })
    const browser = installTestBrowser(
        () => ({ body: [] }),
        {
            authHandler: request => {
                assert.equal(request.url, "/auth/me")
                return {
                    body: {
                        isAuthenticated: true,
                        email: "owner@example.com",
                        role: "superuser"
                    }
                }
            },
            moderationHandler: request => {
                if (request.method === "GET") {
                    return listFails
                        ? {
                            body: { title: "Unavailable" },
                            status: 503
                        }
                        : {
                            body: [{
                                id: "target-1",
                                email: "target@example.com",
                                role: "user",
                                isBanned: false,
                                emailConfirmed: true
                            }]
                        }
                }

                return delayedBan
            }
        }
    )
    const errors = []
    const previousConsoleError = console.error
    console.error = error => errors.push(error)

    try {
        const app = await import("../../src/main.js")
        await app.initialization
        await browser.getButton("Manage users").click()

        assert.deepEqual(app.state.managedUsers, [])
        assert.equal(
            browser.getElement("moderation-list-state").textContent,
            "Users could not be loaded. Try Refresh users."
        )
        assert.equal(
            browser.getElement("app-status").getAttribute("role"),
            "alert"
        )

        listFails = false
        await browser.getButton("Refresh users").click()
        assert.equal(app.state.managedUsers.length, 1)

        const banning = browser.getButton("Ban").click()
        await new Promise(resolve => setImmediate(resolve))
        assert.equal(app.state.mutatingManagedUserId, "target-1")
        assert.equal(browser.getButton("Back to song books").disabled, true)
        assert.equal(browser.getButton("Refresh users").disabled, true)

        resolveBan({
            body: { title: "Server unavailable" },
            status: 503
        })
        await banning
        assert.equal(app.state.managedUsers[0].isBanned, false)
        assert.equal(browser.getButton("Ban").disabled, false)
        assert.equal(
            browser.getElement("app-status").textContent,
            "The account could not be updated. Try again."
        )
        assert.equal(errors.length, 2)
        assert.deepEqual(
            errors.map(error => error.status),
            [503, 503]
        )
    } finally {
        console.error = previousConsoleError
    }
})
