import assert from "node:assert/strict"
import test from "node:test"

import { installTestBrowser } from "../helpers/testBrowser.mjs"

test("moderator only sees permitted actions and loses the view on demotion", async () => {
    let role = "moderator"
    const users = [
        {
            id: "super-1",
            email: "super@example.com",
            role: "superuser",
            isBanned: false,
            emailConfirmed: true
        },
        {
            id: "peer-1",
            email: "peer@example.com",
            role: "moderator",
            isBanned: false,
            emailConfirmed: true
        },
        {
            id: "member-1",
            email: "member@example.com",
            role: "user",
            isBanned: false,
            emailConfirmed: true
        }
    ]
    const browser = installTestBrowser(
        () => ({ body: [] }),
        {
            authHandler: request => {
                assert.equal(request.url, "/auth/me")
                return {
                    body: {
                        isAuthenticated: true,
                        email: "moderator@example.com",
                        role
                    }
                }
            },
            moderationHandler: request => {
                if (request.method === "GET") {
                    return { body: users }
                }

                assert.equal(request.url, "/admin/users/member-1/ban")
                if (role !== "moderator") {
                    return {
                        body: { title: "Forbidden" },
                        status: 403
                    }
                }

                users[2].isBanned = JSON.parse(request.body).isBanned
                return { body: null, status: 204 }
            }
        }
    )
    const app = await import("../../src/main.js")
    await app.initialization
    assert.match(
        browser.getElement("auth-summary").textContent,
        /moderator@example\.com \(Moderator\)/
    )
    await browser.getButton("Manage users").click()

    assert.equal(
        browser.findElements(element =>
            element.dataset?.action === "grant-moderator" ||
            element.dataset?.action === "remove-moderator"
        ).length,
        0
    )
    assert.equal(
        browser.findElements(element =>
            element.dataset?.userId === "super-1" ||
            element.dataset?.userId === "peer-1"
        ).length,
        0
    )

    await browser.findElements(element =>
        element.dataset?.action === "ban-user"
    )[0].click()
    assert.equal(users[2].isBanned, true)
    assert.equal(
        browser.getElement("app-status").textContent,
        "Account banned."
    )

    role = "user"
    await browser.findElements(element =>
        element.dataset?.action === "unban-user"
    )[0].click()
    assert.equal(app.state.auth.role, "user")
    assert.equal(app.state.showUserManagement, false)
    assert.deepEqual(app.state.managedUsers, [])
    assert.equal(browser.getElement("moderation-panel").hidden, true)
    assert.equal(browser.getButton("Manage users"), undefined)
    assert.equal(await app.openUserManagement(), false)
    assert.match(
        browser.getElement("app-status").textContent,
        /cannot manage this account/
    )
})
