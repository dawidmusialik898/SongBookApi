export function isChordAnchor(text, offset) {
    if (!Number.isInteger(offset) || offset < 0 || offset >= text.length) {
        return false
    }

    const code = text.charCodeAt(offset)
    const nextCode = text.charCodeAt(offset + 1)
    return text[offset] !== "\n" &&
        text[offset] !== "\r" &&
        !(code >= 0xdc00 && code <= 0xdfff) &&
        (
            code < 0xd800 ||
            code > 0xdbff ||
            (nextCode >= 0xdc00 && nextCode <= 0xdfff)
        )
}

export function renderChordedText(container, text, chords) {
    container.replaceChildren()
    const ordered = [...chords].sort((a, b) => a.offset - b.offset)
    container.setAttribute("role", "group")
    container.setAttribute(
        "aria-label",
        `Lyrics: ${text}. Chords: ${ordered.map(chord =>
            `${chord.symbol} at character offset ${chord.offset}`
        ).join(", ") || "none"}.`
    )

    let lineStart = 0
    let chordIndex = 0

    function appendLine(lineEnd) {
        const line = document.createElement("div")
        line.className = "chord-line"
        line.setAttribute("aria-hidden", "true")
        const lineChords = []
        while (
            chordIndex < ordered.length &&
            ordered[chordIndex].offset < lineEnd
        ) {
            lineChords.push(ordered[chordIndex])
            chordIndex += 1
        }

        if (lineChords.length === 0) {
            line.textContent = text.slice(lineStart, lineEnd) || "\u00a0"
        } else {
            let from = lineStart
            for (const [index, chord] of lineChords.entries()) {
                if (chord.offset > from) {
                    appendChordCell(
                        line,
                        text.slice(from, chord.offset),
                        ""
                    )
                }

                const to = lineChords[index + 1]?.offset ?? lineEnd
                appendChordCell(line, text.slice(chord.offset, to), chord.symbol)
                from = to
            }
        }

        container.appendChild(line)
    }

    for (const match of text.matchAll(/\r\n|\r|\n/g)) {
        appendLine(match.index)
        lineStart = match.index + match[0].length
    }
    appendLine(text.length)
}

function appendChordCell(line, lyric, symbol) {
    const cell = document.createElement("span")
    cell.className = "chord-cell"

    const chord = document.createElement("span")
    chord.className = "chord-cell__symbol"
    chord.textContent = symbol

    const text = document.createElement("span")
    text.className = "chord-cell__lyric"
    text.textContent = lyric

    cell.appendChild(chord)
    cell.appendChild(text)
    line.appendChild(cell)
}
