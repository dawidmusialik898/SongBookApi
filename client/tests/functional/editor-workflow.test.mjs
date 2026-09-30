import assert from "node:assert/strict"
import test from "node:test"

import { installTestBrowser } from "../helpers/testBrowser.mjs"

test("one editor creates and updates a song using server-owned identities", async () => {
    const songs = new Map()
    let nextSongId = 1
    let nextPartId = 1
    const browser = installTestBrowser(request => {
        const url = new URL(request.url, "https://localhost/")
        const id = url.pathname.split("/").filter(Boolean)[1] ?? null

        if (id === null && request.method === "GET") {
            return {
                body: [...songs.values()].map(
                    song => structuredClone(song)
                )
            }
        }

        if (id === null && request.method === "POST") {
            const payload = JSON.parse(request.body)
            const song = saveServerSong(
                `song-${nextSongId}`,
                payload
            )
            nextSongId += 1
            songs.set(song.id, song)
            return {
                body: structuredClone(song),
                status: 201
            }
        }

        if (id !== null && request.method === "GET" && songs.has(id)) {
            return {
                body: structuredClone(songs.get(id))
            }
        }

        if (id !== null && request.method === "PUT" && songs.has(id)) {
            const song = saveServerSong(id, JSON.parse(request.body))
            songs.set(id, song)
            return {
                body: null,
                status: 204
            }
        }

        return {
            body: {
                message: "Not found"
            },
            status: 404
        }
    })

    function saveServerSong(id, payload) {
        return {
            id,
            ...payload,
            parts: payload.parts.map(part => {
                if (part.id !== undefined) {
                    return { ...part }
                }

                const savedPart = {
                    id: `part-${nextPartId}`,
                    ...part
                }
                nextPartId += 1
                return savedPart
            })
        }
    }

    const app = await import("../../src/main.js")
    await app.initialization
    await browser.getButton("New song").click()

    browser.getElement("song-title").value = "Workflow song"
    browser.getElement("song-author").value = "Workflow author"
    await browser.getButton("Add part").click()
    await browser.getButton("Add part").click()

    let draftKeys = app.state.draftParts.map(part => part.clientKey)
    await findPartField(browser, draftKeys[0], "name").input("Verse")
    await findPartField(browser, draftKeys[0], "text").input("Verse text")
    await findPartField(browser, draftKeys[1], "name").input("Chorus")
    await findPartField(browser, draftKeys[1], "text").input("Chorus text")
    await browser.getElement("song-form").submit()

    assert.equal(songs.size, 1)
    assert.equal(app.state.selectedSongId, "song-1")
    assert.equal(
        browser.document.activeElement.className,
        "song-details__heading"
    )
    assert.deepEqual(
        app.state.selectedSong.parts.map(part => part.id),
        ["part-1", "part-2"]
    )

    await browser.getButton("Edit song").click()
    browser.getElement("song-title").value = "Workflow song updated"
    draftKeys = app.state.draftParts.map(part => part.clientKey)
    await findPartAction(
        browser,
        draftKeys[1],
        "move-part-up"
    ).click()
    await findPartField(browser, draftKeys[0], "text").input(
        "Verse text updated"
    )
    await browser.getElement("song-form").submit()

    const savedSong = songs.get("song-1")
    assert.equal(savedSong.title, "Workflow song updated")
    assert.deepEqual(
        savedSong.parts.map(part => part.id),
        ["part-2", "part-1"]
    )
    assert.deepEqual(
        savedSong.parts.map(part => part.name),
        ["Chorus", "Verse"]
    )
    assert.equal(savedSong.parts[1].text, "Verse text updated")
    assert.equal(app.state.selectedSong.title, "Workflow song updated")
    assert.deepEqual(
        app.state.selectedSong.parts.map(part => part.id),
        ["part-2", "part-1"]
    )
    assert.equal(
        browser.getElement("app-status").textContent,
        "Changes saved."
    )
    assert.equal(
        browser.document.activeElement.className,
        "song-details__heading"
    )
    assert.equal(
        browser.getElement("app-status").getAttribute("role"),
        "status"
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
