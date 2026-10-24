import assert from "node:assert/strict"
import test from "node:test"

import { installTestBrowser } from "../helpers/testBrowser.mjs"

test("a failed save preserves scalar values, part order, and the draft", async () => {
    const browser = installTestBrowser(request => {
        if (request.url.endsWith("/songs") && request.method === "GET") {
            return {
                body: []
            }
        }

        if (request.url.endsWith("/songs") && request.method === "POST") {
            throw new TypeError("API stopped")
        }

        throw new Error(
            `Unexpected request: ${request.method} ${request.url}`
        )
    })
    const app = await import("../../src/main.js")
    await app.initialization
    await browser.getButton("New song").click()

    browser.getElement("song-title").value = "Unsaved title"
    await browser.getButton("Add part").click()
    await browser.getButton("Add part").click()

    const firstKey = app.state.draftParts[0].clientKey
    const secondKey = app.state.draftParts[1].clientKey
    await findPartField(browser, firstKey, "name").input("First")
    await findPartField(browser, secondKey, "name").input("Second")
    await findPartAction(browser, secondKey, "move-part-up").click()

    const expectedDraft = structuredClone(app.state.draftParts)
    const requestCountBeforeSave = browser.requests.length
    const loggedErrors = []
    const originalConsoleError = console.error
    console.error = error => {
        loggedErrors.push(error)
    }

    try {
        await browser.getElement("song-form").submit()
    } finally {
        console.error = originalConsoleError
    }

    assert.equal(browser.requests.length, requestCountBeforeSave + 1)
    assert.equal(app.state.editorMode, "create")
    assert.equal(app.state.isSaving, false)
    assert.equal(browser.getElement("song-form").hidden, false)
    assert.equal(browser.getElement("song-title").value, "Unsaved title")
    assert.deepEqual(app.state.draftParts, expectedDraft)
    assert.deepEqual(
        app.state.draftParts.map(part => part.name),
        ["Second", "First"]
    )
    assert.equal(browser.getElement("song-title").disabled, false)
    assert.equal(browser.getButton("Add part").disabled, false)
    assert.equal(browser.getButton("Cancel").disabled, false)
    assert.equal(browser.getButtons("Move up")[0].disabled, true)
    assert.equal(browser.getButtons("Move down").at(-1).disabled, true)
    assert.equal(
        browser.getElement("song-form").getAttribute("aria-busy"),
        "false"
    )
    assert.equal(
        browser.getElement("app-status").textContent,
        "Could not reach the SongBook API. " +
            "Your new song draft was kept. Try again."
    )
    assert.equal(
        browser.getElement("app-status").getAttribute("role"),
        "alert"
    )
    assert.equal(
        browser.getElement("app-status").getAttribute("aria-live"),
        "assertive"
    )
    assert.equal(
        browser.getElement("song-list-state").textContent,
        "No songs yet. Create the first one."
    )
    assert.equal(loggedErrors[0].status, null)

    const requestCountBeforeCancel = browser.requests.length
    await browser.getButton("Cancel").click()
    assert.equal(app.state.editorMode, "idle")
    assert.equal(browser.getElement("song-form").hidden, true)
    assert.equal(browser.requests.length, requestCountBeforeCancel)
    assert.equal(
        browser.document.activeElement,
        browser.getElement("new-song-button")
    )
})

function findPartField(browser, partKey, fieldName) {
    return browser.findElements(
        element =>
            element.dataset.partKey === partKey &&
            element.dataset.partField === fieldName
    )[0]
}

function findPartAction(browser, partKey, action) {
    return browser.findElements(
        element =>
            element.dataset.partKey === partKey &&
            element.dataset.action === action
    )[0]
}
