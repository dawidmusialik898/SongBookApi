import { isChordAnchor } from "./chords.js"

export function parseChordNotation(notation) {
    const source = String(notation ?? "").replace(/\r\n?/g, "\n")
    const errors = []
    const chords = []
    let text = ""
    let pending = null
    let line = 1

    function appendLyric(value) {
        if (pending !== null) {
            chords.push({ offset: text.length, symbol: pending })
            pending = null
        }
        text += value
    }

    function appendChord(symbol) {
        if (pending !== null) {
            chords.push({ offset: text.length, symbol: pending })
            text += " "
        }
        pending = symbol
    }

    function appendLineBreak() {
        if (pending !== null) {
            chords.push({ offset: text.length, symbol: pending })
            pending = null
            text += " "
        }
        text += "\n"
        line += 1
    }

    for (let index = 0; index < source.length;) {
        const character = source[index]
        if (character === "\\") {
            const next = source[index + 1]
            if (next === "[" || next === "\\") {
                appendLyric(next)
                index += 2
            } else {
                appendLyric("\\")
                index += 1
            }
            continue
        }

        if (character === "[") {
            const lineEnd = source.indexOf("\n", index + 1)
            const closingBracket = source.indexOf("]", index + 1)
            if (
                closingBracket === -1 ||
                (lineEnd !== -1 && closingBracket > lineEnd)
            ) {
                errors.push({
                    line,
                    message: 'Missing "]" after "[".'
                })
                appendLyric("[")
                index += 1
                continue
            }

            const rawSymbol = source.slice(index + 1, closingBracket)
            const symbol = rawSymbol.trim()
            let message = null
            if (rawSymbol.includes("[")) {
                message = 'Unexpected "[" inside a chord.'
            } else if (symbol === "") {
                message = 'Empty chord "[]".'
            } else if (Array.from(symbol).length > 64) {
                const preview = Array.from(symbol).slice(0, 10).join("")
                message = `Chord "${preview}…" is longer than 64 characters.`
            }

            if (message !== null) {
                errors.push({ line, message })
                appendLyric("[")
                index += 1
                continue
            }

            appendChord(symbol)
            index = closingBracket + 1
            continue
        }

        const value = String.fromCodePoint(source.codePointAt(index))
        if (value === "\n") {
            appendLineBreak()
        } else {
            appendLyric(value)
        }
        index += value.length
    }

    if (pending !== null) {
        chords.push({ offset: text.length, symbol: pending })
        text += " "
    }

    return { text, chords, errors }
}

export function serializeChordNotation(text, chords) {
    const source = String(text ?? "")
    if (!Array.isArray(chords)) {
        throw new TypeError("Chord annotations must be an array.")
    }

    const ordered = [...chords].sort((left, right) =>
        left.offset - right.offset
    )
    let previousOffset = -1
    for (const chord of ordered) {
        if (
            !Number.isInteger(chord?.offset) ||
            chord.offset < 0 ||
            chord.offset >= source.length ||
            !isChordAnchor(source, chord.offset) ||
            chord.offset === previousOffset ||
            typeof chord.symbol !== "string"
        ) {
            throw new TypeError("A chord annotation is invalid.")
        }
        previousOffset = chord.offset
    }

    let notation = ""
    let simplified = false
    let chordIndex = 0

    function appendChordsAt(offset) {
        while (ordered[chordIndex]?.offset === offset) {
            const original = ordered[chordIndex].symbol
            const removedCharacters = /[\[\]\r\n]/.test(original)
            let symbol = original.replace(/[\[\]\r\n]/g, "").trim()
            if (removedCharacters) {
                simplified = true
            }
            if (symbol === "") {
                symbol = "?"
                simplified = true
            }
            notation += `[${symbol}]`
            chordIndex += 1
        }
    }

    for (let index = 0; index < source.length;) {
        appendChordsAt(index)
        const value = String.fromCodePoint(source.codePointAt(index))
        if (value === "[") {
            notation += "\\["
        } else if (value === "\\") {
            const next = source[index + 1]
            notation += next === "[" || next === "\\"
                ? "\\\\"
                : "\\"
        } else {
            notation += value
        }
        index += value.length
    }
    appendChordsAt(source.length)

    return { notation, simplified }
}
