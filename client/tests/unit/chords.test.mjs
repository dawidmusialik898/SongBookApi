import assert from "node:assert/strict"
import test from "node:test"

import {
    isChordAnchor,
    renderChordedText
} from "../../src/chords.js"
import { createFakeApi } from "../helpers/fakeApi.mjs"
import { installAppBrowser } from "../helpers/testBrowser.mjs"

test("any lyric character, including a space or emoji, can anchor a chord", () => {
    const text = " A🎸m\nB"
    for (const offset of [0, 1, 2, 4, 6]) {
        assert.equal(isChordAnchor(text, offset), true)
    }
    for (const offset of [-1, 3, 5, 7, 0.5, null]) {
        assert.equal(isChordAnchor(text, offset), false)
    }
    assert.equal(isChordAnchor("\ud83c", 0), false)
})

test("chord symbols render literally above the exact lyric offsets", () => {
    const browser = installAppBrowser({ api: createFakeApi() })
    try {
        const container = browser.document.createElement("div")
        renderChordedText(container, "A B\nC", [
            { offset: 2, symbol: "<Am>" },
            { offset: 0, symbol: "G" },
            { offset: 4, symbol: "D" }
        ])

        assert.equal(container.children.length, 2)
        const firstLine = container.children[0]
        assert.deepEqual(firstLine.children.map(cell => [
            cell.children[0].textContent,
            cell.children[1].textContent
        ]), [
            ["G", "A "],
            ["<Am>", "B"]
        ])
        assert.deepEqual(container.children[1].children.map(cell => [
            cell.children[0].textContent,
            cell.children[1].textContent
        ]), [["D", "C"]])
        assert.match(container.getAttribute("aria-label"), /Lyrics: A B\nC/)
        assert.equal(firstLine.getAttribute("aria-hidden"), "true")
        assert.equal(firstLine.textContent, "GA <Am>B")
    } finally {
        browser.restore()
    }
})
