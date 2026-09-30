import assert from "node:assert/strict"
import test from "node:test"

import { installTestBrowser } from "../helpers/testBrowser.mjs"

test("reset query secrets are consumed once, sanitized, and submitted", async () => {
    let resetPayload = null
    const browser = installTestBrowser(
        () => ({ body: [] }),
        {
            initialUrl:
                "https://localhost/?auth=reset-password" +
                "&email=user%40example.com&code=sensitive-code&keep=1",
            authHandler: request => {
                if (request.url === "/auth/me") {
                    return {
                        body: {
                            isAuthenticated: false,
                            email: null
                        }
                    }
                }

                if (request.url === "/auth/reset-password") {
                    resetPayload = JSON.parse(request.body)
                    return { body: null, status: 204 }
                }

                throw new Error(`Unexpected auth request ${request.url}`)
            }
        }
    )

    const app = await import("../../src/main.js")
    await app.initialization

    assert.equal(browser.location.search, "?keep=1")
    assert.equal(app.state.authView, "reset-password")
    assert.equal(
        browser.getElement("reset-password-email").value,
        "user@example.com"
    )
    assert.equal(browser.getElement("reset-password-code").value, "")
    assert.equal(
        browser.document.activeElement,
        browser.getElement("reset-password-new-password")
    )

    browser.getElement("reset-password-new-password").value =
        "new password long"
    browser.getElement("reset-password-confirm-password").value =
        "new password long"
    await browser.getElement("reset-password-form").submit()

    assert.deepEqual(resetPayload, {
        email: "user@example.com",
        code: "sensitive-code",
        newPassword: "new password long"
    })
    assert.equal(app.state.authView, "login")
    assert.doesNotMatch(browser.location.href, /sensitive-code/)
    assert.doesNotMatch(browser.document.body.textContent, /sensitive-code/)
    assert.equal(
        browser.getElement("app-status").textContent,
        "Password reset. Sign in with the new password."
    )
})
