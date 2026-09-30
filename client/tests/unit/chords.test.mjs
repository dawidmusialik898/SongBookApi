import assert from "node:assert/strict"
import test from "node:test"

import {
    adjustChordsForTextEdit,
    isChordAnchor,
    renderChordedText
} from "../../src/chords.js"
import { installTestBrowser } from "../helpers/testBrowser.mjs"

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
    const browser = installTestBrowser(() => ({ body: [] }))
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
})

test("edits shift unaffected chords and remove only edited anchors", () => {
    const chords = [
        { offset: 0, symbol: "G" },
        { offset: 1, symbol: "C" },
        { offset: 3, symbol: "D" }
    ]
    const insertion = adjustChordsForTextEdit(
        chords,
        "aaaa",
        "aaaaa",
        { start: 0, end: 0, inputType: "insertText" }
    )
    assert.deepEqual(insertion.chords.map(chord => chord.offset), [1, 2, 4])
    assert.equal(insertion.removedCount, 0)
    assert.deepEqual(chords.map(chord => chord.offset), [0, 1, 3])

    const deletion = adjustChordsForTextEdit(
        chords,
        "aaaa",
        "aaa",
        { start: 1, end: 2, inputType: "deleteContentBackward" }
    )
    assert.deepEqual(deletion.chords.map(chord => chord.offset), [0, 2])
    assert.equal(deletion.removedCount, 1)

    const backward = adjustChordsForTextEdit(
        [{ offset: 2, symbol: "C" }, { offset: 3, symbol: "G" }],
        "abcd",
        "abd",
        { start: 3, end: 3, inputType: "deleteContentBackward" }
    )
    assert.deepEqual(backward.chords, [{ offset: 2, symbol: "G" }])
    assert.equal(backward.removedCount, 1)

    const replacement = adjustChordsForTextEdit(
        [
            { offset: 0, symbol: "A" },
            { offset: 2, symbol: "B" },
            { offset: 4, symbol: "C" }
        ],
        "abcde",
        "aXe",
        { start: 1, end: 4, inputType: "insertText" }
    )
    assert.deepEqual(replacement.chords, [
        { offset: 0, symbol: "A" },
        { offset: 2, symbol: "C" }
    ])
    assert.equal(replacement.removedCount, 1)

    const emojiReplacement = adjustChordsForTextEdit(
        [{ offset: 0, symbol: "C" }],
        "🎸a",
        "🎵a"
    )
    assert.deepEqual(emojiReplacement.chords, [])
    assert.equal(emojiReplacement.removedCount, 1)
})
