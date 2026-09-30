import assert from "node:assert/strict"
import test from "node:test"

import { installTestBrowser } from "../helpers/testBrowser.mjs"

test("create validates, ignores duplicate submits, and selects server truth", async () => {
    const postResponse = createDeferred()
    const serverSongs = []
    let postCalls = 0
    let postedPayload
    const browser = installTestBrowser(request => {
        if (request.url.endsWith("/songs") && request.method === "GET") {
            return {
                body: structuredClone(serverSongs)
            }
        }

        if (request.url.endsWith("/songs") && request.method === "POST") {
            postCalls += 1
            postedPayload = JSON.parse(request.body)
            return postResponse.promise
        }

        const songId = request.url.split("/").at(-1)
        const song = serverSongs.find(item => item.id === songId)

        if (song !== undefined && request.method === "GET") {
            return {
                body: structuredClone(song)
            }
        }

        throw new Error(
            `Unexpected request: ${request.method} ${request.url}`
        )
    })
    const app = await import("../../src/main.js")
    await app.initialization
    await browser.getButton("New song").click()

    const form = browser.getElement("song-form")
    const titleControl = browser.getElement("song-title")
    titleControl.valid = false
    await form.submit()
    assert.equal(form.reportValidityCalls, 1)
    assert.equal(postCalls, 0)
    assert.equal(browser.document.activeElement, titleControl)

    titleControl.valid = true
    browser.getElement("song-title").value = "  Created song  "
    browser.getElement("song-author").value = " "
    browser.getElement("song-number").value = " 12 "
    await browser.getButton("Add part").click()

    const partName = browser.findElements(
        element => element.dataset.partField === "name"
    )[0]
    const partText = browser.findElements(
        element => element.dataset.partField === "text"
    )[0]
    await partName.input(" Verse ")
    await partText.input(" First line\nSecond line ")

    const firstSubmit = form.submit()
    await form.submit()
    await new Promise(resolve => setImmediate(resolve))

    assert.equal(postCalls, 1)
    assert.equal(app.state.isSaving, true)
    assert.equal(browser.getElement("song-title").disabled, true)
    assert.equal(browser.getButton("Add part").disabled, true)
    assert.equal(browser.getButton("Cancel").disabled, true)
    assert.equal(browser.getElement("save-song-button").disabled, true)
    assert.equal(browser.getButton("Refresh songs").disabled, false)
    assert.equal(
        browser.getElement("song-form").getAttribute("aria-busy"),
        "true"
    )
    assert.equal(
        browser.getElement("song-form-status").textContent,
        "Form controls are disabled while the song is being created."
    )
    assert.equal(
        browser.getElement("app-status").textContent,
        "Creating song..."
    )

    const createdSong = {
        id: "created-song",
        ...postedPayload,
        parts: [{
            id: "server-part-id",
            ...postedPayload.parts[0]
        }]
    }
    serverSongs.push(createdSong)
    postResponse.resolve({
        body: createdSong,
        status: 201
    })
    await firstSubmit

    assert.deepEqual(postedPayload, {
        title: "Created song",
        author: null,
        originalTitle: null,
        number: "12",
        key: null,
        tempo: null,
        parts: [{
            name: "Verse",
            text: "First line\nSecond line"
        }]
    })
    assert.equal(Object.hasOwn(postedPayload, "id"), false)
    assert.equal(Object.hasOwn(postedPayload, "order"), false)
    assert.equal(Object.hasOwn(postedPayload.parts[0], "id"), false)
    assert.equal(app.state.isSaving, false)
    assert.equal(app.state.editorMode, "idle")
    assert.equal(app.state.selectedSongId, "created-song")
    assert.equal(app.state.selectedSong.parts[0].id, "server-part-id")
    assert.equal(browser.getElement("song-form").hidden, true)
    assert.equal(
        browser.getElement("app-status").textContent,
        "Song created."
    )
    assert.equal(browser.getElement("song-title").disabled, false)
    assert.equal(
        browser.getElement("song-form").getAttribute("aria-busy"),
        "false"
    )
    assert.equal(browser.getElement("song-form-status").textContent, "")
    assert.equal(
        browser.document.activeElement.className,
        "song-details__heading"
    )
    assert.equal(
        browser.getElement("app-status").getAttribute("role"),
        "status"
    )
    assert.equal(
        browser.getElement("app-status").getAttribute("aria-live"),
        "polite"
    )
    assert.deepEqual(
        browser.requests.map(request => request.method),
        ["GET", "POST", "GET"]
    )
})

test("an invalid create response does not report success or discard the draft", async () => {
    const browser = installTestBrowser(request => {
        if (request.method === "GET") {
            return { body: [] }
        }
        if (request.method === "POST") {
            return { body: { id: "created-song" }, status: 201 }
        }
        throw new Error(`Unexpected song request: ${request.url}`)
    })
    const app = await import("../../src/main.js?invalid-create")
    await app.initialization
    await browser.getButton("New song").click()
    browser.getElement("song-title").value = "Unconfirmed draft"

    const originalConsoleError = console.error
    const errors = []
    console.error = error => errors.push(error)
    try {
        await browser.getElement("song-form").submit()
    } finally {
        console.error = originalConsoleError
    }

    assert.equal(app.state.editorMode, "create")
    assert.equal(app.state.selectedSongId, null)
    assert.equal(browser.getElement("song-title").value, "Unconfirmed draft")
    assert.equal(
        browser.getElement("app-status").textContent,
        "The song may have been created, but the API returned " +
            "an invalid response. Refresh songs before trying again."
    )
    assert.equal(errors[0].name, "ApiError")
    assert.deepEqual(
        browser.requests.map(request => request.method),
        ["GET", "POST"]
    )
})

function createDeferred() {
    let resolve
    const promise = new Promise(resolvePromise => {
        resolve = resolvePromise
    })

    return {
        promise,
        resolve
    }
}
