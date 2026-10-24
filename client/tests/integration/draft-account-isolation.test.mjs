import assert from "node:assert/strict"
import test from "node:test"

import { installTestBrowser } from "../helpers/testBrowser.mjs"

test("an expired-session draft is not restored for another account", async () => {
    let authenticated = true
    let currentEmail = "owner@example.com"
    const browser = installTestBrowser(
        request => {
            if (request.method === "GET") {
                return { body: [] }
            }

            authenticated = false
            return { body: { title: "Unauthorized" }, status: 401 }
        },
        {
            authHandler: request => {
                if (request.url === "/auth/me") {
                    return {
                        body: {
                            isAuthenticated: authenticated,
                            email: authenticated ? currentEmail : null
                        }
                    }
                }

                if (request.url === "/auth/login") {
                    authenticated = true
                    currentEmail = "editor@example.com"
                    return { body: null, status: 204 }
                }

                throw new Error(
                    `Unexpected auth request ${request.url}`
                )
            }
        }
    )
    const app = await import("../../src/main.js")
    await app.initialization

    await browser.getButton("New song").click()
    browser.getElement("song-title").value = "Owner-only draft"
    await browser.getElement("song-form").submit()

    browser.getElement("login-email").value = "editor@example.com"
    browser.getElement("login-password").value = "different account"
    await browser.getElement("login-form").submit()

    assert.equal(app.state.auth.email, "editor@example.com")
    assert.equal(app.state.editorMode, "idle")
    assert.equal(browser.getElement("song-form").hidden, true)
    assert.doesNotMatch(
        browser.document.body.textContent,
        /Owner-only draft/
    )
})
