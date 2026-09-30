import assert from "node:assert/strict"
import test from "node:test"

import { installTestBrowser } from "../helpers/testBrowser.mjs"

test("a new song accepts chords at spaces, adjacent characters, and later lines", async () => {
    const songs = []
    let posted
    const browser = installTestBrowser(request => {
        if (request.method === "GET" && request.url === "/songs") {
            return { body: structuredClone(songs) }
        }
        if (request.method === "POST" && request.url === "/songs") {
            posted = JSON.parse(request.body)
            const saved = {
                id: "song-chords",
                ...posted,
                parts: posted.parts.map(part => ({
                    id: "part-chords",
                    ...part
                }))
            }
            songs.push(saved)
            return { body: saved, status: 201 }
        }
        throw new Error(`Unexpected request: ${request.method} ${request.url}`)
    })
    const app = await import("../../src/main.js?create-chords")
    await app.initialization
    await browser.getButton("New song").click()
    browser.getElement("song-title").value = "Chords"
    await browser.getButton("Add part").click()

    const text = browser.findElements(
        element => element.dataset.partField === "text"
    )[0]
    await text.input(" A🎸\nB ")
    const symbol = browser.findElements(
        element => element.dataset.partField === "chord"
    )[0]

    for (const [offset, chord] of [
        [0, " G "], [1, "D"], [2, "Em7"], [5, "F#"], [6, "C/G"]
    ]) {
        text.selectionStart = offset
        text.selectionEnd = offset
        await text.click()
        symbol.value = chord
        if (offset === 0) {
            const enter = await symbol.dispatch("keydown", {
                key: "Enter"
            })
            assert.equal(enter.defaultPrevented, true)
            assert.equal(posted, undefined)
        } else {
            await browser.getButton("Set chord").click()
        }
    }

    assert.equal(app.state.draftParts[0].chords.length, 5)
    await browser.getElement("song-form").submit()
    assert.deepEqual(posted.parts, [{
        name: null,
        text: " A🎸\nB ",
        chords: [
            { offset: 0, symbol: "G" },
            { offset: 1, symbol: "D" },
            { offset: 2, symbol: "Em7" },
            { offset: 5, symbol: "F#" },
            { offset: 6, symbol: "C/G" }
        ]
    }])
    assert.equal(app.state.selectedSong.parts[0].chords.length, 5)
    assert.equal(
        browser.findElements(
            element => element.className === "chord-cell__symbol"
        ).filter(element => element.textContent !== "").length,
        5
    )
    const checkbox = browser.findElements(
        element => element.id === "show-song-chords"
    )[0]
    assert.equal(checkbox.checked, true)
    checkbox.checked = false
    await checkbox.dispatch("change")
    assert.equal(app.state.showChords, false)
    assert.equal(
        browser.findElements(
            element => element.className === "song-part__text"
        )[0].textContent,
        " A🎸\nB "
    )
    assert.equal(
        browser.document.activeElement.id,
        "show-song-chords"
    )
    const showAgain = browser.findElements(
        element => element.id === "show-song-chords"
    )[0]
    showAgain.checked = true
    await showAgain.dispatch("change")
    assert.equal(app.state.showChords, true)
    assert.equal(
        browser.findElements(
            element => element.className === "chord-cell__symbol"
        ).filter(element => element.textContent !== "").length,
        5
    )
})

test("editing a chorded part retains annotations, shifts them on insert, and reports removals", async () => {
    let song = {
        id: "song-1",
        title: "Existing",
        parts: [{
            id: "part-1",
            name: "Verse",
            text: "A A",
            chords: [
                { offset: 0, symbol: "G" },
                { offset: 2, symbol: "C" }
            ]
        }]
    }
    let updated
    const browser = installTestBrowser(request => {
        if (request.method === "GET" && request.url === "/songs") {
            return { body: [structuredClone(song)] }
        }
        if (request.method === "GET" && request.url === "/songs/song-1") {
            return { body: structuredClone(song) }
        }
        if (request.method === "PUT" && request.url === "/songs/song-1") {
            updated = JSON.parse(request.body)
            song = {
                id: "song-1",
                ...updated,
                parts: updated.parts.map(part => ({
                    id: part.id,
                    ...part
                }))
            }
            return { body: null, status: 204 }
        }
        throw new Error(`Unexpected request: ${request.method} ${request.url}`)
    })
    const app = await import("../../src/main.js?edit-chords")
    await app.initialization
    await browser.getButton("View").click()
    assert.deepEqual(
        browser.findElements(
            element => element.className === "chord-cell__symbol"
        ).filter(element => element.textContent !== "")
            .map(element => element.textContent),
        ["G", "C"]
    )
    await browser.getButton("Edit song").click()

    const text = browser.findElements(
        element => element.dataset.partField === "text"
    )[0]
    const symbol = browser.findElements(
        element => element.dataset.partField === "chord"
    )[0]
    const firstChord = browser.findElements(
        element => element.dataset.action === "select-chord" &&
            element.dataset.offset === "0"
    )[0]
    await firstChord.click()
    assert.equal(symbol.value, "G")
    symbol.value = "G7"
    await browser.getButton("Set chord").click()
    assert.equal(app.state.draftParts[0].chords[0].symbol, "G7")

    text.selectionStart = 0
    text.selectionEnd = 0
    await text.dispatch("beforeinput")
    text.selectionStart = 1
    text.selectionEnd = 1
    await text.input("XA A")
    assert.deepEqual(
        app.state.draftParts[0].chords.map(chord => chord.offset),
        [1, 3]
    )
    assert.equal(
        browser.findElements(
            element => element.className === "part-editor__chord-message"
        )[0].textContent,
        ""
    )

    text.selectionStart = 3
    text.selectionEnd = 4
    await text.dispatch("beforeinput")
    text.selectionEnd = 3
    await text.input("XA ")
    assert.deepEqual(app.state.draftParts[0].chords, [
        { offset: 1, symbol: "G7" }
    ])
    assert.equal(
        browser.findElements(
            element => element.className === "part-editor__chord-message"
        )[0].textContent,
        "1 chord was removed because the anchored lyric changed."
    )

    await browser.getElement("song-form").submit()
    assert.deepEqual(updated.parts, [{
        id: "part-1",
        name: "Verse",
        text: "XA ",
        chords: [{ offset: 1, symbol: "G7" }]
    }])
    assert.deepEqual(app.state.selectedSong.parts[0].chords, [
        { offset: 1, symbol: "G7" }
    ])

    await browser.getButton("Edit song").click()
    const savedChord = browser.findElements(
        element => element.dataset.action === "select-chord" &&
            element.dataset.offset === "1"
    )[0]
    await savedChord.click()
    await browser.getButton("Remove chord").click()
    await browser.getElement("song-form").submit()
    assert.deepEqual(updated.parts[0].chords, [])
    assert.deepEqual(app.state.selectedSong.parts[0].chords, [])
    assert.equal(
        browser.findElements(
            element => element.id === "show-song-chords"
        ).length,
        0
    )
})

test("a same-account sign-in restores set chords and an unsubmitted symbol", async () => {
    let authenticated = true
    const browser = installTestBrowser(
        request => {
            if (request.method === "GET") {
                return { body: [] }
            }
            authenticated = false
            return { body: { title: "Unauthorized" }, status: 401 }
        },
        {
            authHandler: request => {
                if (request.url === "/auth/me") {
                    return {
                        body: {
                            isAuthenticated: authenticated,
                            email: authenticated
                                ? "owner@example.test"
                                : null
                        }
                    }
                }
                if (request.url === "/auth/login") {
                    authenticated = true
                    return { body: null, status: 204 }
                }
                throw new Error(`Unexpected auth request: ${request.url}`)
            }
        }
    )
    const app = await import("../../src/main.js?restore-chords")
    await app.initialization
    await browser.getButton("New song").click()
    browser.getElement("song-title").value = "Chords in progress"
    await browser.getButton("Add part").click()

    const text = browser.findElements(
        element => element.dataset.partField === "text"
    )[0]
    await text.input("A B")
    text.selectionStart = 0
    await text.click()
    let symbol = browser.findElements(
        element => element.dataset.partField === "chord"
    )[0]
    await symbol.input("G")
    await browser.getButton("Set chord").click()
    text.selectionStart = 2
    await text.click()
    await symbol.input(" Am ")

    await browser.getElement("song-form").submit()
    assert.equal(app.state.editorMode, "idle")
    browser.getElement("login-email").value = "owner@example.test"
    browser.getElement("login-password").value = "same account"
    await browser.getElement("login-form").submit()

    assert.equal(app.state.editorMode, "create")
    assert.equal(app.state.draftParts[0].selectedOffset, 2)
    assert.deepEqual(app.state.draftParts[0].chords, [
        { offset: 0, symbol: "G" }
    ])
    symbol = browser.findElements(
        element => element.dataset.partField === "chord"
    )[0]
    assert.equal(symbol.value, " Am ")
    await browser.getButton("Set chord").click()
    assert.deepEqual(app.state.draftParts[0].chords, [
        { offset: 0, symbol: "G" },
        { offset: 2, symbol: "Am" }
    ])
})
