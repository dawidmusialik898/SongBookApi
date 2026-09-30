import assert from "node:assert/strict"
import test from "node:test"

import { installTestBrowser } from "../helpers/testBrowser.mjs"

test("startup and Refresh use the adapter while failures retain the list", async () => {
    const responses = [
        {
            body: [{
                id: "startup-song",
                number: "1",
                title: "Startup song",
                author: "Startup author"
            }]
        },
        {
            body: [{
                id: "fetched-song",
                number: "2",
                title: "Fetched song",
                author: "Fetched author"
            }]
        },
        {
            body: {
                message: "Unavailable"
            },
            status: 503
        }
    ]
    const browser = installTestBrowser(() => responses.shift())

    const app = await import("../../src/main.js")
    await app.initialization

    assert.deepEqual(
        browser.getSongSummaries(),
        ["1. Startup song — Startup author"]
    )
    assert.equal(browser.requests.length, 1)
    assert.equal(browser.requests[0].method, "GET")

    await browser.getButton("Refresh songs").click()

    assert.equal(browser.requests.length, 2)
    assert.equal(browser.requests[1].method, "GET")
    assert.equal(app.state.songs[0].title, "Fetched song")
    assert.deepEqual(
        browser.getSongSummaries(),
        ["2. Fetched song — Fetched author"]
    )

    const loggedErrors = []
    const originalConsoleError = console.error
    console.error = error => {
        loggedErrors.push(error)
    }

    try {
        await browser.getButton("Refresh songs").click()
    } finally {
        console.error = originalConsoleError
    }

    assert.equal(browser.requests.length, 3)
    assert.equal(app.state.songs[0].title, "Fetched song")
    assert.deepEqual(
        browser.getSongSummaries(),
        ["2. Fetched song — Fetched author"]
    )
    assert.equal(loggedErrors.length, 1)
    assert.equal(loggedErrors[0].name, "ApiError")
    assert.equal(loggedErrors[0].status, 503)
    assert.equal(
        browser.getElement("app-status").textContent,
        "The server could not load songs. Try again. " +
            "The displayed list may be out of date."
    )
    assert.equal(
        browser.getElement("app-status").className,
        "notice notice--error"
    )
    assert.equal(
        browser.getElement("app-status").getAttribute("role"),
        "alert"
    )
})
