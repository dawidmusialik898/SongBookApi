import assert from "node:assert/strict"
import test from "node:test"

import { installTestBrowser } from "../helpers/testBrowser.mjs"

test("superuser assigns moderators and manages accounts in a separate view", async () => {
    let authenticated = true
    const users = [
        {
            id: "user-1",
            email: "member@example.com",
            role: "user",
            isBanned: false,
            emailConfirmed: true
        },
        {
            id: "user-2",
            email: "pending@example.com",
            role: "user",
            isBanned: false,
            emailConfirmed: false
        },
        {
            id: "user-3",
            email: "other-admin@example.com",
            role: "superuser",
            isBanned: false,
            emailConfirmed: true
        }
    ]
    const browser = installTestBrowser(
        () => ({ body: [] }),
        {
            authHandler: request => {
                if (request.url === "/auth/me") {
                    return {
                        body: {
                            isAuthenticated: authenticated,
                            email: authenticated
                                ? "owner@example.com"
                                : null,
                            role: authenticated ? "superuser" : null
                        }
                    }
                }

                if (request.url === "/auth/logout") {
                    authenticated = false
                    return { body: null, status: 204 }
                }

                throw new Error(`Unexpected auth request ${request.url}`)
            },
            moderationHandler: request => {
                if (request.method === "GET") {
                    return { body: users }
                }

                assert.equal(
                    request.headers["x-csrf-token"],
                    "test-antiforgery-token"
                )
                const segments = request.url.split("/").filter(Boolean)
                const user = users.find(entry => entry.id === segments[2])
                assert.ok(user)

                if (request.method === "PUT" &&
                    segments[3] === "role") {
                    user.role = JSON.parse(request.body).role
                    return { body: null, status: 204 }
                }

                if (request.method === "PUT" &&
                    segments[3] === "ban") {
                    user.isBanned = JSON.parse(request.body).isBanned
                    return { body: null, status: 204 }
                }

                if (request.method === "DELETE" &&
                    segments.length === 3) {
                    users.splice(users.indexOf(user), 1)
                    return { body: null, status: 204 }
                }

                throw new Error(`Unexpected request ${request.method} ${request.url}`)
            }
        }
    )
    const app = await import("../../src/main.js")
    await app.initialization

    assert.equal(browser.getButton("Manage users").hidden, false)
    assert.match(
        browser.getElement("auth-summary").textContent,
        /owner@example\.com \(SuperUser\)/
    )
    await browser.getButton("Manage users").click()

    assert.equal(app.state.showUserManagement, true)
    assert.equal(browser.getElement("moderation-panel").hidden, false)
    assert.equal(browser.getElement("song-books-panel").hidden, true)
    assert.equal(browser.getElement("song-book-content").hidden, true)
    assert.equal(browser.getElement("song-actions").hidden, true)
    assert.equal(
        browser.document.activeElement,
        browser.getElement("moderation-heading")
    )
    assert.match(
        browser.getElement("moderation-list").textContent,
        /member@example\.comUser - Active/
    )
    assert.equal(findAction(browser, "grant-moderator", "user-2"), undefined)
    assert.equal(findAction(browser, "ban-user", "user-3"), undefined)

    browser.queueConfirmResult(false)
    await findAction(browser, "grant-moderator", "user-1").click()
    assert.equal(users[0].role, "user")
    assert.equal(
        browser.moderationRequests.filter(
            request => request.method !== "GET"
        ).length,
        0
    )
    await findAction(browser, "grant-moderator", "user-1").click()
    assert.equal(users[0].role, "moderator")
    assert.equal(findAction(browser, "grant-moderator", "user-1"), undefined)
    assert.ok(findAction(browser, "remove-moderator", "user-1"))
    assert.equal(
        browser.getElement("app-status").textContent,
        "Moderator access granted."
    )
    assert.equal(
        browser.document.activeElement.dataset.userId,
        "user-1"
    )

    await findAction(browser, "ban-user", "user-1").click()
    assert.equal(users[0].isBanned, true)
    assert.ok(findAction(browser, "unban-user", "user-1"))
    await findAction(browser, "unban-user", "user-1").click()
    assert.equal(users[0].isBanned, false)

    browser.queueConfirmResult(false)
    await findAction(browser, "delete-user", "user-2").click()
    assert.equal(users.length, 3)
    await findAction(browser, "delete-user", "user-2").click()
    assert.equal(users.length, 2)
    assert.equal(
        browser.getElement("app-status").textContent,
        "Account and its song books deleted."
    )
    assert.match(browser.confirmations.at(-1), /all of their song books/)

    await browser.getButton("Back to song books").click()
    assert.equal(app.state.showUserManagement, false)
    assert.deepEqual(app.state.managedUsers, [])
    assert.equal(browser.getElement("song-books-panel").hidden, false)
    assert.equal(browser.getElement("song-actions").hidden, false)
    assert.equal(
        browser.document.activeElement,
        browser.getElement("manage-users-button")
    )

    await browser.getButton("Manage users").click()
    await browser.getButton("Sign out").click()
    assert.equal(browser.getElement("moderation-panel").hidden, true)
    assert.deepEqual(app.state.managedUsers, [])
    assert.equal(browser.getButton("Manage users"), undefined)
})

function findAction(browser, action, userId) {
    return browser.findElements(element =>
        element.dataset?.action === action &&
        element.dataset.userId === userId
    )[0]
}
