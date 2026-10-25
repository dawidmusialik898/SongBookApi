import {
    parseChordNotation,
    serializeChordNotation
} from "./chordNotation.js"

const FIELD_NAMES = [
    "title",
    "author",
    "originalTitle",
    "number",
    "key",
    "tempo"
]

export function songToEditorModel(song) {
    if (
        song === null ||
        typeof song !== "object" ||
        !Array.isArray(song.parts)
    ) {
        throw new TypeError("Song details must include a parts array.")
    }

    const fields = {}
    for (const name of FIELD_NAMES) {
        fields[name] = readText(song[name])
    }

    const simplified = []
    const parts = song.parts.map(part => {
        if (part === null || typeof part !== "object") {
            throw new TypeError("A song part must be an object.")
        }

        const sourceText = readText(part.text)
        const text = sourceText.replace(/\r\n?/g, "\n")
        const chords = (Array.isArray(part.chords) ? part.chords : [])
            .map(chord => {
                if (
                    chord === null ||
                    typeof chord !== "object" ||
                    !Number.isInteger(chord.offset) ||
                    chord.offset < 0 ||
                    chord.offset > sourceText.length ||
                    typeof chord.symbol !== "string"
                ) {
                    throw new TypeError("A song chord is invalid.")
                }

                return {
                    offset: sourceText.slice(0, chord.offset)
                        .replace(/\r\n?/g, "\n").length,
                    symbol: chord.symbol
                }
            })
        const serialized = serializeChordNotation(text, chords)
        const key = createPartKey()
        if (serialized.simplified) {
            simplified.push(part.id ?? key)
        }

        return {
            key,
            id: part.id ?? null,
            name: readText(part.name),
            notation: serialized.notation
        }
    })

    return { fields, parts, simplified }
}

export function createEmptyEditorModel() {
    return {
        fields: Object.fromEntries(FIELD_NAMES.map(name => [name, ""])),
        parts: [createEmptyPart()],
        simplified: []
    }
}

export function cloneEditorModel(model) {
    return {
        fields: { ...model.fields },
        parts: model.parts.map(part => ({ ...part })),
        simplified: [...model.simplified]
    }
}

export function editorModelFingerprint(model) {
    return JSON.stringify({
        fields: Object.entries(model.fields),
        parts: model.parts.map(part => [
            part.key,
            part.id,
            part.name,
            part.notation
        ])
    })
}

export function editorModelToPayload(model) {
    if (
        model === null ||
        typeof model !== "object" ||
        !Array.isArray(model.parts)
    ) {
        throw new TypeError("An editor model with parts is required.")
    }

    const fields = {}
    for (const name of FIELD_NAMES) {
        fields[name] = normalizeText(model.fields?.[name])
    }

    const parts = []
    const errors = []
    for (const part of model.parts) {
        if (part === null || typeof part !== "object") {
            throw new TypeError("An editor part must be an object.")
        }
        const name = readText(part.name)
        const notation = readText(part.notation)
        if (name.trim() === "" && notation.trim() === "") {
            continue
        }

        const parsed = parseChordNotation(notation)
        for (const error of parsed.errors) {
            errors.push({
                partKey: part.key,
                line: error.line,
                message: error.message
            })
        }
        if (parsed.errors.length > 0) {
            continue
        }

        const payloadPart = {
            name: normalizeText(name),
            text: parsed.chords.length > 0
                ? parsed.text
                : normalizeText(parsed.text),
            chords: parsed.chords.map(chord => ({
                offset: chord.offset,
                symbol: chord.symbol
            }))
        }
        if (part.id !== null && part.id !== undefined) {
            payloadPart.id = part.id
        }
        parts.push(payloadPart)
    }

    if (errors.length > 0) {
        return { errors }
    }

    return {
        payload: {
            ...fields,
            parts
        }
    }
}

function createEmptyPart() {
    return {
        key: createPartKey(),
        id: null,
        name: "",
        notation: ""
    }
}

function createPartKey() {
    if (typeof globalThis.crypto?.randomUUID !== "function") {
        throw new Error("A cryptographic UUID generator is required.")
    }
    return globalThis.crypto.randomUUID()
}

function readText(value) {
    return value === null || value === undefined
        ? ""
        : String(value)
}

function normalizeText(value) {
    const normalized = readText(value).trim()
    return normalized === "" ? null : normalized
}
