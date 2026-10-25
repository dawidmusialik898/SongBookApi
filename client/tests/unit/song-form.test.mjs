import assert from "node:assert/strict"
import test from "node:test"

import {
    cloneEditorModel,
    createEmptyEditorModel,
    editorModelFingerprint,
    editorModelToPayload,
    songToEditorModel
} from "../../src/songForm.js"

test("empty editor model has every field and one uniquely keyed part", () => {
    const first = createEmptyEditorModel()
    const second = createEmptyEditorModel()

    assert.deepEqual(first.fields, {
        title: "",
        author: "",
        originalTitle: "",
        number: "",
        key: "",
        tempo: ""
    })
    assert.equal(first.parts.length, 1)
    assert.deepEqual(first.parts[0], {
        key: first.parts[0].key,
        id: null,
        name: "",
        notation: ""
    })
    assert.match(first.parts[0].key, /^[\da-f-]{36}$/i)
    assert.notEqual(first.parts[0].key, second.parts[0].key)
    assert.deepEqual(first.simplified, [])
})

test("model cloning isolates editor data and fingerprints part order", () => {
    const model = createEmptyEditorModel()
    model.parts.push({
        key: "second",
        id: null,
        name: "Chorus",
        notation: ""
    })
    const clone = cloneEditorModel(model)
    assert.equal(editorModelFingerprint(clone), editorModelFingerprint(model))

    clone.parts[0].name = "Verse"
    assert.notEqual(editorModelFingerprint(clone), editorModelFingerprint(model))
    assert.equal(model.parts[0].name, "")

    const reordered = cloneEditorModel(model)
    reordered.parts.reverse()
    assert.notEqual(
        editorModelFingerprint(reordered),
        editorModelFingerprint(model)
    )
})

test("song model normalizes line endings and shifts chord offsets", () => {
    const model = songToEditorModel({
        title: " Amazing Grace ",
        author: null,
        originalTitle: undefined,
        number: " 1 ",
        key: "G",
        tempo: 120,
        parts: [{
            id: "part-1",
            name: "Verse",
            text: " A\r\n🎸 ",
            chords: [
                { offset: 0, symbol: "G" },
                { offset: 4, symbol: "Em" }
            ]
        }]
    })

    assert.deepEqual(model.fields, {
        title: " Amazing Grace ",
        author: "",
        originalTitle: "",
        number: " 1 ",
        key: "G",
        tempo: "120"
    })
    assert.equal(model.parts.length, 1)
    assert.equal(model.parts[0].id, "part-1")
    assert.equal(model.parts[0].name, "Verse")
    assert.equal(model.parts[0].notation, "[G] A\n[Em]🎸 ")
    assert.deepEqual(model.simplified, [])
})

test("song model identifies source parts whose chord symbols were simplified", () => {
    const model = songToEditorModel({
        parts: [
            {
                id: "part-simplified",
                text: "Amazing",
                chords: [{ offset: 0, symbol: "G]" }]
            },
            {
                id: "part-unchanged",
                text: "Grace",
                chords: [{ offset: 0, symbol: "?" }]
            }
        ]
    })

    assert.deepEqual(model.simplified, ["part-simplified"])
    assert.equal(model.parts[0].notation, "[G]Amazing")
    assert.equal(model.parts[1].notation, "[?]Grace")
})

test("payload normalizes fields, retains IDs, and sends explicit chord arrays", () => {
    const result = editorModelToPayload({
        fields: {
            title: " Song title ",
            author: " ",
            originalTitle: null,
            number: " 7 ",
            key: " D ",
            tempo: "120"
        },
        parts: [
            {
                key: "existing",
                id: "part-1",
                name: " Verse ",
                notation: "[G]Amazing [D7]grace"
            },
            {
                key: "plain",
                id: null,
                name: " Chorus ",
                notation: "  unchorded  "
            },
            {
                key: "untrimmed",
                id: null,
                name: " Bridge ",
                notation: "[Am]  grace "
            },
            {
                key: "literal",
                id: null,
                name: "Literal",
                notation: "\\[x]"
            },
            {
                key: "blank",
                id: "part-to-remove",
                name: "  ",
                notation: " \n\t "
            }
        ]
    })

    assert.deepEqual(result, {
        payload: {
            title: "Song title",
            author: null,
            originalTitle: null,
            number: "7",
            key: "D",
            tempo: "120",
            parts: [
                {
                    id: "part-1",
                    name: "Verse",
                    text: "Amazing grace",
                    chords: [
                        { offset: 0, symbol: "G" },
                        { offset: 8, symbol: "D7" }
                    ]
                },
                {
                    name: "Chorus",
                    text: "unchorded",
                    chords: []
                },
                {
                    name: "Bridge",
                    text: "  grace ",
                    chords: [{ offset: 0, symbol: "Am" }]
                },
                {
                    name: "Literal",
                    text: "[x]",
                    chords: []
                }
            ]
        }
    })
    assert.equal(Object.hasOwn(result.payload, "key"), true)
    assert.equal(Object.hasOwn(result.payload.parts[0], "key"), false)
    assert.equal(Object.hasOwn(result.payload.parts[1], "id"), false)
})

test("payload reports every invalid part without returning a payload", () => {
    const result = editorModelToPayload({
        fields: {},
        parts: [
            { key: "first", id: null, name: "", notation: "[G" },
            { key: "second", id: null, name: "", notation: "[A[B]" },
            { key: "blank", id: null, name: "", notation: " " }
        ]
    })

    assert.deepEqual(result, {
        errors: [
            {
                partKey: "first",
                line: 1,
                message: 'Missing "]" after "[".'
            },
            {
                partKey: "second",
                line: 1,
                message: 'Unexpected "[" inside a chord.'
            }
        ]
    })
})
