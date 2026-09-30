import assert from "node:assert/strict"
import test from "node:test"

import { installTestBrowser } from "../helpers/testBrowser.mjs"

test("late user-directory response cannot restore private data after sign-out", async () => {
    let authenticated = true
    let resolveUsers
    const delayedUsers = new Promise(resolve => {
        resolveUsers = resolve
    })
    const browser = installTestBrowser(
        () => ({ body: [] }),
        {
            authHandler: request => {
                if (request.url === "/auth/me") {
                    return {
                        body: {
                            isAuthenticated: authenticated,
                            email: authenticated ? "owner@example.com" : null,
                            role: authenticated ? "superuser" : null
                        }
                    }
                }

                if (request.url === "/auth/logout") {
                    authenticated = false
                    return { body: null, status: 204 }
                }

                throw new Error(`Unexpected auth request: ${request.url}`)
            },
            moderationHandler: () => delayedUsers
        }
    )
    const app = await import("../../src/main.js")
    await app.initialization

    const opening = browser.getButton("Manage users").click()
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(app.state.isLoadingManagedUsers, true)
    assert.equal(
        browser.getElement("moderation-list").getAttribute("aria-busy"),
        "true"
    )

    await browser.getButton("Sign out").click()
    resolveUsers({
        body: [{
            id: "private-user",
            email: "private@example.com",
            role: "user",
            isBanned: false,
            emailConfirmed: true
        }]
    })
    await opening

    assert.equal(app.state.auth.status, "anonymous")
    assert.equal(app.state.showUserManagement, false)
    assert.deepEqual(app.state.managedUsers, [])
    assert.equal(browser.getElement("moderation-panel").hidden, true)
    assert.doesNotMatch(browser.document.body.textContent, /private@example\.com/)
})
