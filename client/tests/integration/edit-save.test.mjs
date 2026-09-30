import assert from "node:assert/strict"
import test from "node:test"

import { installTestBrowser } from "../helpers/testBrowser.mjs"

test("edit saves by selected route and preserves part identity and order", async () => {
    let serverSong = {
        id: "song-1",
        title: "Original song",
        author: "Original author",
        originalTitle: null,
        number: "1",
        key: "C",
        tempo: "Slow",
        parts: [
            {
                id: "part-1",
                name: "Verse",
                text: "Verse text"
            },
            {
                id: "part-2",
                name: "Chorus",
                text: "Chorus text"
            }
        ]
    }
    let putRequest
    const browser = installTestBrowser(request => {
        if (request.url.endsWith("/songs") && request.method === "GET") {
            return {
                body: [structuredClone(serverSong)]
            }
        }

        if (
            request.url.endsWith("/songs/song-1") &&
            request.method === "GET"
        ) {
            return {
                body: structuredClone(serverSong)
            }
        }

        if (
            request.url.endsWith("/songs/song-1") &&
            request.method === "PUT"
        ) {
            putRequest = request
            const payload = JSON.parse(request.body)
            serverSong = {
                id: "song-1",
                ...payload,
                parts: payload.parts.map(part => ({
                    id: part.id ?? "server-new-part-id",
                    name: part.name,
                    text: part.text
                }))
            }
            return {
                body: null,
                status: 204
            }
        }

        throw new Error(
            `Unexpected request: ${request.method} ${request.url}`
        )
    })
    const app = await import("../../src/main.js")
    await app.initialization
    await browser.getButton("View").click()
    await browser.getButton("Edit song").click()

    browser.getElement("song-title").value = " Updated song "
    browser.getElement("song-key").value = " A "

    const firstPartText = browser.findElements(
        element =>
            element.dataset.partKey ===
                app.state.draftParts[0].clientKey &&
            element.dataset.partField === "text"
    )[0]
    await firstPartText.input(" Updated verse ")

    await browser.getButton("Add part").click()
    const newPartKey = app.state.draftParts.at(-1).clientKey
    await browser.findElements(
        element =>
            element.dataset.partKey === newPartKey &&
            element.dataset.partField === "name"
    )[0].input(" Bridge ")
    await browser.findElements(
        element =>
            element.dataset.partKey === newPartKey &&
            element.dataset.partField === "text"
    )[0].input(" Bridge text ")

    await findPartAction(browser, newPartKey, "move-part-up").click()
    await findPartAction(browser, newPartKey, "move-part-up").click()

    const removedPartKey = app.state.draftParts.find(
        part => part.id === "part-2"
    ).clientKey
    await findPartAction(browser, removedPartKey, "remove-part").click()

    assert.deepEqual(
        app.state.draftParts.map(part => part.id),
        [null, "part-1"]
    )

    await browser.getElement("song-form").submit()

    const payload = JSON.parse(putRequest.body)
    assert.equal(
        putRequest.url,
        "/songs/song-1"
    )
    assert.equal(Object.hasOwn(payload, "id"), false)
    assert.equal(Object.hasOwn(payload, "order"), false)
    assert.deepEqual(payload.parts, [
        {
            name: "Bridge",
            text: "Bridge text"
        },
        {
            id: "part-1",
            name: "Verse",
            text: "Updated verse"
        }
    ])
    assert.equal(app.state.editorMode, "idle")
    assert.equal(app.state.selectedSongId, "song-1")
    assert.equal(app.state.selectedSong.title, "Updated song")
    assert.equal(app.state.selectedSong.key, "A")
    assert.deepEqual(
        app.state.selectedSong.parts.map(part => part.id),
        ["server-new-part-id", "part-1"]
    )
    assert.deepEqual(
        app.state.selectedSong.parts.map(part => part.name),
        ["Bridge", "Verse"]
    )
    assert.equal(
        browser.getElement("app-status").textContent,
        "Changes saved."
    )
    assert.equal(
        browser.document.activeElement.className,
        "song-details__heading"
    )
    assert.deepEqual(
        browser.requests.map(request => request.method),
        ["GET", "GET", "PUT", "GET", "GET"]
    )
})

function findPartAction(browser, partKey, action) {
    return browser.findElements(
        element =>
            element.dataset.action === action &&
            element.dataset.partKey === partKey
    )[0]
}
