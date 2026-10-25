import assert from "node:assert/strict"
import test from "node:test"

import {
    parseChordNotation,
    serializeChordNotation
} from "../../src/chordNotation.js"

test("parses chord placement, escapes, line breaks, and Unicode anchors", () => {
    const vectors = [
        {
            notation: "[G]Amazing [D7]grace",
            text: "Amazing grace",
            chords: [
                { offset: 0, symbol: "G" },
                { offset: 8, symbol: "D7" }
            ]
        },
        {
            notation: "sound[A7]",
            text: "sound ",
            chords: [{ offset: 5, symbol: "A7" }]
        },
        {
            notation: "[G][D]word",
            text: " word",
            chords: [
                { offset: 0, symbol: "G" },
                { offset: 1, symbol: "D" }
            ]
        },
        {
            notation: "[G] [D] [Em]",
            text: "   ",
            chords: [
                { offset: 0, symbol: "G" },
                { offset: 1, symbol: "D" },
                { offset: 2, symbol: "Em" }
            ]
        },
        {
            notation: "one[C]\ntwo",
            text: "one \ntwo",
            chords: [{ offset: 3, symbol: "C" }]
        },
        {
            notation: "\\[x] and \\\\",
            text: "[x] and \\",
            chords: []
        },
        {
            notation: "[ Am ]x",
            text: "x",
            chords: [{ offset: 0, symbol: "Am" }]
        },
        {
            notation: "[C]😀",
            text: "😀",
            chords: [{ offset: 0, symbol: "C" }]
        },
        {
            notation: "first\r\nsecond\rthird",
            text: "first\nsecond\nthird",
            chords: []
        }
    ]

    for (const vector of vectors) {
        const parsed = parseChordNotation(vector.notation)
        assert.deepEqual(parsed, {
            text: vector.text,
            chords: vector.chords,
            errors: []
        }, vector.notation)
    }
})

test("reports every notation error on its line", () => {
    const parsed = parseChordNotation(
        `[G\n[]\n[${"x".repeat(65)}]\n[A[B]`
    )

    assert.deepEqual(parsed.errors, [
        { line: 1, message: 'Missing "]" after "[".' },
        { line: 2, message: 'Empty chord "[]".' },
        {
            line: 3,
            message: 'Chord "xxxxxxxxxx…" is longer than 64 characters.'
        },
        { line: 4, message: 'Unexpected "[" inside a chord.' }
    ])
})

test("continues parsing after an error and treats its opening bracket literally", () => {
    const parsed = parseChordNotation("[A[B]\n[C")

    assert.deepEqual(parsed.errors, [
        { line: 1, message: 'Unexpected "[" inside a chord.' },
        { line: 2, message: 'Missing "]" after "[".' }
    ])
    assert.equal(parsed.text.startsWith("[A"), true)
})

test("serializing valid annotations round-trips text and UTF-16 offsets", () => {
    const vectors = [
        {
            text: "Amazing grace",
            chords: [
                { offset: 0, symbol: "G" },
                { offset: 8, symbol: "D7" }
            ]
        },
        {
            text: "😀 line\n[x] and \\",
            chords: [
                { offset: 0, symbol: "C" },
                { offset: 2, symbol: "Am" },
                { offset: 8, symbol: "D" }
            ]
        }
    ]

    for (const vector of vectors) {
        const serialized = serializeChordNotation(
            vector.text,
            vector.chords
        )
        assert.equal(serialized.simplified, false)
        assert.deepEqual(
            parseChordNotation(serialized.notation),
            {
                text: vector.text,
                chords: vector.chords,
                errors: []
            }
        )
    }
})

test("generated lyric strings round-trip across Unicode and escape boundaries", () => {
    const atoms = ["a", "😀", " ", "[", "\\", "ł", "\n"]
    for (let first = 0; first < atoms.length; first++) {
        for (let second = 0; second < atoms.length; second++) {
            const text = `${atoms[first]}x${atoms[second]}\n` +
                atoms[(first + second) % atoms.length]
            const anchors = []
            let offset = 0
            for (const character of text) {
                if (character !== "\n") {
                    anchors.push(offset)
                }
                offset += character.length
            }
            const chords = anchors
                .filter((_anchor, index) => index % 2 === 0)
                .slice(0, 3)
                .map((anchor, index) => ({
                    offset: anchor,
                    symbol: `C${first}${second}${index}`
                }))
            const serialized = serializeChordNotation(text, chords)

            assert.equal(serialized.simplified, false)
            assert.deepEqual(parseChordNotation(serialized.notation), {
                text,
                chords,
                errors: []
            })
        }
    }
})

test("serializer escapes literal brackets and only necessary backslashes", () => {
    const text = "[x] \\[x] \\\\"
    const serialized = serializeChordNotation(text, [])

    assert.equal(
        serialized.notation,
        String.raw`\[x] \\\[x] ` + "\\".repeat(3)
    )
    assert.deepEqual(parseChordNotation(serialized.notation), {
        text,
        chords: [],
        errors: []
    })
})

test("serializer simplifies chord symbols that notation cannot represent", () => {
    const serialized = serializeChordNotation("word!", [
        { offset: 0, symbol: "A[B]C" },
        { offset: 4, symbol: "[]\r\n" }
    ])

    assert.equal(serialized.simplified, true)
    assert.deepEqual(parseChordNotation(serialized.notation), {
        text: "word!",
        chords: [
            { offset: 0, symbol: "ABC" },
            { offset: 4, symbol: "?" }
        ],
        errors: []
    })
})

test("serializer rejects invalid, duplicate, and unanchorable offsets", () => {
    assert.throws(
        () => serializeChordNotation("word", [
            { offset: 4, symbol: "G" }
        ]),
        /annotation is invalid/
    )
    assert.throws(
        () => serializeChordNotation("word", [
            { offset: 0, symbol: "G" },
            { offset: 0, symbol: "D" }
        ]),
        /annotation is invalid/
    )
    assert.throws(
        () => serializeChordNotation("a\nb", [
            { offset: 1, symbol: "G" }
        ]),
        /annotation is invalid/
    )
})
