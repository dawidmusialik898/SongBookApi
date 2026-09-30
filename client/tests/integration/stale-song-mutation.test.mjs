import assert from "node:assert/strict"
import test from "node:test"

import { installTestBrowser } from "../helpers/testBrowser.mjs"

test("a late save cannot close a different account's new draft", async () => {
    let authenticated = true
    let currentEmail = "owner@example.com"
    const deferredSave = createDeferred()
    const browser = installTestBrowser(
        request => {
            if (request.method === "GET") {
                return { body: [] }
            }

            if (request.method === "POST") {
                return deferredSave.promise
            }

            throw new Error(
                `Unexpected song request ${request.method} ${request.url}`
            )
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

                if (request.url === "/auth/logout") {
                    authenticated = false
                    return { body: null, status: 204 }
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
    browser.getElement("song-title").value = "First account draft"
    const oldSave = browser.getElement("song-form").submit()
    await new Promise(resolve => setImmediate(resolve))

    await browser.getButton("Sign out").click()
    await browser.getButton("Sign in").click()
    browser.getElement("login-email").value = "editor@example.com"
    browser.getElement("login-password").value = "second account"
    await browser.getElement("login-form").submit()
    await browser.getButton("New song").click()
    browser.getElement("song-title").value = "Second account draft"

    deferredSave.resolve({
        body: {
            id: "old-song",
            title: "First account draft",
            parts: []
        },
        status: 201
    })
    await oldSave

    assert.equal(app.state.auth.email, "editor@example.com")
    assert.equal(app.state.editorMode, "create")
    assert.equal(
        browser.getElement("song-title").value,
        "Second account draft"
    )
    assert.equal(browser.getElement("song-form").hidden, false)
    assert.doesNotMatch(
        browser.getElement("app-status").textContent,
        /Song created/
    )
})

function createDeferred() {
    let resolve
    const promise = new Promise(resolvePromise => {
        resolve = resolvePromise
    })

    return { promise, resolve }
}
