import assert from "node:assert/strict"
import test from "node:test"

import { installTestBrowser } from "../helpers/testBrowser.mjs"

test("book conflicts and unknown collaborators preserve entered values", async () => {
    const summary = {
        id: "book-1",
        name: "Existing",
        accessLevel: "admin",
        songCount: 0
    }
    const browser = installTestBrowser(
        () => ({ body: [] }),
        {
            songBookHandler: request => {
                const segments = new URL(
                    request.url,
                    "https://localhost/"
                ).pathname.split("/").filter(Boolean)

                if (request.method === "GET" && segments.length === 1) {
                    return { body: [summary] }
                }

                if (request.method === "GET" && segments.length === 2) {
                    return { body: summary }
                }

                if (
                    request.method === "GET" &&
                    segments.at(-1) === "access"
                ) {
                    return { body: [] }
                }

                if (request.method === "PUT" && segments.length === 2) {
                    return {
                        body: { title: "Duplicate name" },
                        status: 409
                    }
                }

                if (
                    request.method === "PUT" &&
                    segments.at(-1) === "access"
                ) {
                    return {
                        body: { title: "Not found" },
                        status: 404
                    }
                }

                throw new Error(
                    `Unexpected request ${request.method} ${request.url}`
                )
            }
        }
    )
    const app = await import("../../src/main.js")
    await app.initialization
    const loggedErrors = []
    const originalConsoleError = console.error
    console.error = error => {
        loggedErrors.push(error)
    }

    try {
        await browser.getButton("Rename").click()
        browser.getElement("song-book-name").value = "existing"
        await browser.getElement("song-book-form").submit()

        assert.equal(app.state.songBookFormMode, "rename")
        assert.equal(browser.getElement("song-book-form").hidden, false)
        assert.equal(browser.getElement("song-book-name").value, "existing")
        assert.equal(
            browser.getElement("app-status").textContent,
            "You already have a song book with that name. " +
                "Choose a different name."
        )

        await browser.getButton("Cancel").click()
        browser.getElement("song-book-access-email").value =
            "missing@example.com"
        await browser.getElement("song-book-access-form").submit()

        assert.equal(
            browser.getElement("song-book-access-email").value,
            "missing@example.com"
        )
        assert.equal(
            browser.getElement("app-status").textContent,
            "No registered account was found for that email."
        )
    } finally {
        console.error = originalConsoleError
    }

    assert.deepEqual(
        loggedErrors.map(error => error.status),
        [409, 404]
    )
})
