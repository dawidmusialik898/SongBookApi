import assert from "node:assert/strict"
import test from "node:test"

import { installTestBrowser } from "../helpers/testBrowser.mjs"

test("notices use correct semantics and expose only safe API details", async () => {
    const saveOutcomes = [
        {
            body: {
                errors: {
                    title: ["Title must be shorter"]
                }
            },
            status: 400
        },
        {
            body: "<strong>Internal validation markup</strong>",
            contentType: "text/html",
            status: 400
        },
        {
            body: {
                message: "Database unavailable"
            },
            status: 503
        },
        new Error("Unexpected save failure")
    ]
    const browser = installTestBrowser(request => {
        if (request.url.endsWith("/songs") && request.method === "GET") {
            return {
                body: []
            }
        }

        if (request.url.endsWith("/songs") && request.method === "POST") {
            const outcome = saveOutcomes.shift()

            if (outcome instanceof Error) {
                throw outcome
            }

            return outcome
        }

        throw new Error(
            `Unexpected request: ${request.method} ${request.url}`
        )
    })
    const app = await import("../../src/main.js")
    await app.initialization

    app.setNotice("error", "Action failed.")
    app.renderNotice()
    assert.equal(browser.getElement("app-status").className, "notice notice--error")
    assert.equal(browser.getElement("app-status").getAttribute("role"), "alert")
    assert.equal(
        browser.getElement("app-status").getAttribute("aria-live"),
        "assertive"
    )

    app.setNotice("success", "Action completed.")
    app.renderNotice()
    assert.equal(
        browser.getElement("app-status").className,
        "notice notice--success"
    )
    assert.equal(browser.getElement("app-status").getAttribute("role"), "status")
    assert.equal(
        browser.getElement("app-status").getAttribute("aria-live"),
        "polite"
    )

    app.setNotice(null)
    app.renderNotice()
    assert.equal(browser.getElement("app-status").className, "notice")
    assert.equal(browser.getElement("app-status").textContent, "")

    await browser.getButton("New song").click()
    browser.getElement("song-title").value = "Draft title"

    const loggedErrors = []
    const originalConsoleError = console.error
    console.error = error => {
        loggedErrors.push(error)
    }

    try {
        await browser.getElement("song-form").submit()
        assert.equal(
            browser.getElement("app-status").textContent,
            "The API rejected the submitted song. " +
                "Title must be shorter. " +
                "Review the entered values and try again. " +
                "Your new song draft was kept."
        )

        await browser.getElement("song-form").submit()
        assert.equal(
            browser.getElement("app-status").textContent,
            "The API rejected the submitted song. " +
                "Review the entered values and try again. " +
                "Your new song draft was kept."
        )
        assert.doesNotMatch(
            browser.getElement("app-status").textContent,
            /strong|markup/i
        )

        await browser.getElement("song-form").submit()
        assert.equal(
            browser.getElement("app-status").textContent,
            "The server could not create the song. " +
                "Your new song draft was kept. Try again."
        )

        await browser.getElement("song-form").submit()
        assert.equal(
            browser.getElement("app-status").textContent,
            "Could not create the song. " +
                "Your new song draft was kept. Try again."
        )
    } finally {
        console.error = originalConsoleError
    }

    assert.equal(loggedErrors.length, 4)
    assert.equal(loggedErrors.at(-1).message, "Unexpected save failure")
    assert.equal(browser.getElement("song-title").value, "Draft title")
    assert.equal(
        browser.getElement("song-list-state").textContent,
        "No songs yet. Create the first one."
    )
})
