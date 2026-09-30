import assert from "node:assert/strict"
import test from "node:test"

import { installTestBrowser } from "../helpers/testBrowser.mjs"

test("register, login, recovery, and logout protect private reads", async () => {
    let authenticated = false
    const authBodies = new Map()
    const browser = installTestBrowser(
        () => ({
            body: [{
                id: "public-song",
                title: "Public song",
                parts: []
            }]
        }),
        {
            authHandler: request => {
                if (request.url === "/auth/me") {
                    return {
                        body: {
                            isAuthenticated: authenticated,
                            email: authenticated
                                ? "user@example.com"
                                : null
                        }
                    }
                }

                if (request.body !== null) {
                    authBodies.set(request.url, JSON.parse(request.body))
                }

                if (request.url === "/auth/login") {
                    const credentials = JSON.parse(request.body)

                    if (credentials.email === "unknown@example.com") {
                        return {
                            body: { title: "Unauthorized" },
                            status: 401
                        }
                    }

                    authenticated = true
                    return { body: null, status: 204 }
                }

                if (request.url === "/auth/logout") {
                    authenticated = false
                    return { body: null, status: 204 }
                }

                return { body: null, status: 202 }
            }
        }
    )

    const app = await import("../../src/main.js")
    await app.initialization

    assert.deepEqual(browser.getSongSummaries(), [])
    assert.equal(app.state.songBooks.length, 0)
    assert.equal(browser.getElement("new-song-button").hidden, true)

    await browser.getButton("Register").click()
    browser.getElement("register-email").value = "user@example.com"
    browser.getElement("register-password").value = "long password value"
    browser.getElement("register-confirm-password").value =
        "long password value"
    await browser.getElement("register-form").submit()

    assert.deepEqual(authBodies.get("/auth/register"), {
        email: "user@example.com",
        password: "long password value"
    })
    assert.equal(app.state.auth.status, "anonymous")
    assert.match(
        browser.getElement("app-status").textContent,
        /confirmation link/
    )

    await browser.getButton("Sign in").click()
    browser.getElement("login-email").value = "unknown@example.com"
    browser.getElement("login-password").value = "not exposed"
    await browser.getElement("login-form").submit()
    assert.equal(app.state.auth.status, "anonymous")
    assert.equal(
        browser.getElement("app-status").textContent,
        "Sign-in failed. Check your credentials or use the " +
            "confirmation and password recovery options."
    )
    assert.doesNotMatch(browser.document.body.textContent, /not exposed/)

    browser.getElement("login-email").value = "user@example.com"
    browser.getElement("login-password").value = "long password value"
    browser.getElement("login-remember-me").checked = true
    await browser.getElement("login-form").submit()

    assert.deepEqual(authBodies.get("/auth/login"), {
        email: "user@example.com",
        password: "long password value",
        rememberMe: true
    })
    assert.equal(app.state.auth.status, "authenticated")
    assert.deepEqual(browser.getSongSummaries(), ["Public song"])
    assert.equal(browser.getElement("new-song-button").hidden, false)
    assert.equal(browser.getButtons("Delete").length, 1)

    await browser.getButton("New song").click()
    browser.getElement("song-title").value = "Draft closed by logout"
    await browser.getButton("Sign out").click()

    assert.equal(app.state.auth.status, "anonymous")
    assert.equal(app.state.editorMode, "idle")
    assert.equal(browser.getElement("song-form").hidden, true)
    assert.deepEqual(browser.getSongSummaries(), [])
    assert.equal(app.state.songBooks.length, 0)
    assert.equal(browser.getElement("new-song-button").hidden, true)
    assert.equal(browser.getButtons("Delete").length, 0)

    await browser.getButton("Sign in").click()
    await browser.getButton("Forgot password").click()
    browser.getElement("forgot-password-email").value =
        "unknown@example.com"
    await browser.getElement("forgot-password-form").submit()
    const forgotNotice =
        browser.getElement("app-status").textContent

    await app.openAuthView("resend-confirmation")
    browser.getElement("resend-confirmation-email").value =
        "unknown@example.com"
    await browser.getElement("resend-confirmation-form").submit()

    assert.equal(
        forgotNotice,
        "If the account is eligible, an email was sent."
    )
    assert.equal(
        browser.getElement("app-status").textContent,
        forgotNotice
    )
})
