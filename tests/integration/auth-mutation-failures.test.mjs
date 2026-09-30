import assert from "node:assert/strict"
import test from "node:test"

import { installTestBrowser } from "../helpers/testBrowser.mjs"

test("401 and 403 keep a create draft while requesting authentication", async () => {
    let authenticated = true
    let mutationStatus = 401
    const browser = installTestBrowser(
        request => {
            if (request.method === "GET") {
                return { body: [] }
            }

            if (request.method === "POST") {
                if (mutationStatus === 401) {
                    authenticated = false
                }

                return {
                    body: { title: "Denied" },
                    status: mutationStatus
                }
            }

            throw new Error(`Unexpected request ${request.method}`)
        },
        {
            authHandler: request => {
                if (request.url === "/auth/me") {
                    return {
                        body: {
                            isAuthenticated: authenticated,
                            email: authenticated
                                ? "editor@example.com"
                                : null
                        }
                    }
                }

                if (request.url === "/auth/login") {
                    authenticated = true
                    return { body: null, status: 204 }
                }

                throw new Error(`Unexpected auth request ${request.url}`)
            }
        }
    )
    const app = await import("../../src/main.js")
    await app.initialization
    await browser.getButton("New song").click()
    browser.getElement("song-title").value = "Unsaved draft"

    await browser.getElement("song-form").submit()

    assert.equal(app.state.editorMode, "idle")
    assert.equal(browser.getElement("song-form").hidden, true)
    assert.deepEqual(app.state.songBooks, [])
    assert.equal(app.state.selectedSongBookId, null)
    assert.deepEqual(app.state.songs, [])
    assert.equal(app.state.auth.status, "anonymous")
    assert.equal(app.state.authView, "login")
    assert.equal(
        browser.document.activeElement,
        browser.getElement("login-email")
    )
    assert.match(
        browser.getElement("app-status").textContent,
        /session ended.*unsaved song data was kept/i
    )

    browser.getElement("login-email").value = "editor@example.com"
    browser.getElement("login-password").value = "password not logged"
    await browser.getElement("login-form").submit()

    assert.equal(app.state.editorMode, "create")
    assert.equal(browser.getElement("song-title").value, "Unsaved draft")
    assert.equal(browser.getElement("song-form").hidden, false)

    mutationStatus = 403
    await browser.getElement("song-form").submit()

    assert.equal(app.state.editorMode, "create")
    assert.equal(browser.getElement("song-title").value, "Unsaved draft")
    assert.match(
        browser.getElement("app-status").textContent,
        /not allowed.*song data was kept/i
    )
})
