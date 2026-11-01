export const DETAIL_FIELDS = Object.freeze([
    ["title", "Title"],
    ["author", "Author"],
    ["originalTitle", "Original title"],
    ["number", "Number"],
    ["key", "Key"],
    ["tempo", "Tempo"]
])

// Beyond this many line pairs, fall back to a linear prefix/suffix comparison.
const MAX_LCS_CELLS = 250_000

export function partDisplayName(part, index) {
    const name = typeof part?.name === "string" ? part.name.trim() : ""
    return name === "" ? `Part ${index + 1}` : name
}

export function compareSongSnapshots(before, after) {
    const fields = []
    for (const [key, label] of DETAIL_FIELDS) {
        const left = emptyToNull(before[key])
        const right = emptyToNull(after[key])
        if (left !== right) fields.push({ key, label, before: left, after: right })
    }

    const oldParts = before.parts ?? []
    const newParts = after.parts ?? []
    const oldById = new Map(oldParts.map((part, index) => [part.id, { part, index }]))
    const newIds = new Set(newParts.map(part => part.id))
    const parts = []
    const unchangedParts = []

    for (const [index, part] of newParts.entries()) {
        const previous = oldById.get(part.id)
        if (previous === undefined) {
            parts.push({
                id: part.id, status: "added", name: partDisplayName(part, index), position: index + 1,
                rows: splitLines(part).map(line => ({ kind: "added", ...line, marks: [] }))
            })
            continue
        }
        const name = partDisplayName(part, index)
        const previousName = partDisplayName(previous.part, previous.index)
        const rows = compareLines(splitLines(previous.part), splitLines(part))
        const linesChanged = rows.some(row => row.kind !== "same")
        const renamed = previousName !== name
        const moved = previous.index !== index
        if (!linesChanged && !renamed && !moved) {
            unchangedParts.push(name)
            continue
        }
        parts.push({
            id: part.id, status: "changed", name, position: index + 1,
            previousName: renamed ? previousName : null,
            previousPosition: moved ? previous.index + 1 : null,
            rows: linesChanged ? rows : []
        })
    }

    // Show removed parts where they used to be, after their nearest surviving predecessor.
    for (const [index, part] of oldParts.entries()) {
        if (newIds.has(part.id)) continue
        let insertAt = 0
        for (let anchor = index - 1; anchor >= 0; anchor--) {
            const found = parts.findIndex(entry => entry.id === oldParts[anchor].id)
            if (found !== -1) { insertAt = found + 1; break }
        }
        while (insertAt < parts.length && parts[insertAt].status === "removed") insertAt++
        parts.splice(insertAt, 0, {
            id: part.id, status: "removed", name: partDisplayName(part, index), previousPosition: index + 1,
            rows: splitLines(part).map(line => ({ kind: "removed", ...line, marks: [] }))
        })
    }

    return { fields, parts, unchangedParts, hasChanges: fields.length > 0 || parts.length > 0 }
}

function emptyToNull(value) {
    if (value === undefined || value === null) return null
    const text = String(value)
    return text.trim() === "" ? null : text
}

function splitLines(part) {
    const text = part.text ?? ""
    const chords = [...(part.chords ?? [])].sort((a, b) => a.offset - b.offset)
    const lines = []
    let start = 0
    const push = end => {
        lines.push({
            text: text.slice(start, end),
            chords: chords.filter(chord => chord.offset >= start && chord.offset < end)
                .map(chord => ({ offset: chord.offset - start, symbol: chord.symbol, changed: false }))
        })
    }
    for (const match of text.matchAll(/\r\n|\r|\n/g)) {
        push(match.index)
        start = match.index + match[0].length
    }
    push(text.length)
    return lines
}

function lineKey(line) {
    return JSON.stringify([line.text, line.chords.map(chord => [chord.offset, chord.symbol])])
}

function compareLines(oldLines, newLines) {
    const oldKeys = oldLines.map(lineKey)
    const newKeys = newLines.map(lineKey)
    let prefix = 0
    while (prefix < oldKeys.length && prefix < newKeys.length && oldKeys[prefix] === newKeys[prefix]) prefix++
    let suffix = 0
    while (suffix < oldKeys.length - prefix && suffix < newKeys.length - prefix &&
        oldKeys[oldKeys.length - 1 - suffix] === newKeys[newKeys.length - 1 - suffix]) suffix++

    const rows = oldLines.slice(0, prefix).map(line => same(line))
    const oldMiddle = oldLines.slice(prefix, oldLines.length - suffix)
    const newMiddle = newLines.slice(prefix, newLines.length - suffix)
    const ops = (oldMiddle.length * newMiddle.length) <= MAX_LCS_CELLS
        ? lcsOps(oldMiddle, newMiddle, oldKeys.slice(prefix, oldKeys.length - suffix), newKeys.slice(prefix, newKeys.length - suffix))
        : [...oldMiddle.map(line => ({ kind: "removed", line })), ...newMiddle.map(line => ({ kind: "added", line }))]

    let removed = []
    let added = []
    const flush = () => {
        for (let index = 0; index < Math.max(removed.length, added.length); index++) {
            const left = removed[index]
            const right = added[index]
            if (left && right) {
                const [leftRow, rightRow] = pairLines(left, right)
                rows.push(leftRow, rightRow)
            } else if (left) rows.push({ kind: "removed", ...left, marks: [] })
            else rows.push({ kind: "added", ...right, marks: [] })
        }
        removed = []
        added = []
    }
    for (const op of ops) {
        if (op.kind === "same") { flush(); rows.push(same(op.line)) }
        else if (op.kind === "removed") removed.push(op.line)
        else added.push(op.line)
    }
    flush()
    for (const line of oldLines.slice(oldLines.length - suffix)) rows.push(same(line))
    return rows
}

function same(line) {
    return { kind: "same", ...line, marks: [] }
}

function lcsOps(oldLines, newLines, oldKeys, newKeys) {
    const rows = oldKeys.length
    const cols = newKeys.length
    const table = Array.from({ length: rows + 1 }, () => new Uint32Array(cols + 1))
    for (let i = rows - 1; i >= 0; i--) {
        for (let j = cols - 1; j >= 0; j--) {
            table[i][j] = oldKeys[i] === newKeys[j]
                ? table[i + 1][j + 1] + 1
                : Math.max(table[i + 1][j], table[i][j + 1])
        }
    }
    const ops = []
    let i = 0
    let j = 0
    while (i < rows && j < cols) {
        if (oldKeys[i] === newKeys[j]) { ops.push({ kind: "same", line: newLines[j] }); i++; j++ }
        else if (table[i + 1][j] >= table[i][j + 1]) ops.push({ kind: "removed", line: oldLines[i++] })
        else ops.push({ kind: "added", line: newLines[j++] })
    }
    while (i < rows) ops.push({ kind: "removed", line: oldLines[i++] })
    while (j < cols) ops.push({ kind: "added", line: newLines[j++] })
    return ops
}

function isLowSurrogate(text, index) {
    const code = text.charCodeAt(index)
    return code >= 0xdc00 && code <= 0xdfff
}

function pairLines(left, right) {
    const a = left.text
    const b = right.text
    let prefix = 0
    while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix++
    while (prefix > 0 && (isLowSurrogate(a, prefix) || isLowSurrogate(b, prefix))) prefix--
    let suffix = 0
    while (suffix < a.length - prefix && suffix < b.length - prefix &&
        a[a.length - 1 - suffix] === b[b.length - 1 - suffix]) suffix++
    while (suffix > 0 && (isLowSurrogate(a, a.length - suffix) || isLowSurrogate(b, b.length - suffix))) suffix--
    const delta = b.length - a.length

    // Map an offset across the edit; offsets inside the edited span have no counterpart.
    const toRight = offset => offset < prefix ? offset : offset >= a.length - suffix ? offset + delta : null
    const toLeft = offset => offset < prefix ? offset : offset >= b.length - suffix ? offset - delta : null
    const symbolAt = (chords, offset) => offset === null ? undefined : chords.find(chord => chord.offset === offset)?.symbol
    const mark = (chords, others, map) => chords.map(chord =>
        ({ ...chord, changed: symbolAt(others, map(chord.offset)) !== chord.symbol }))

    const leftEnd = a.length - suffix
    const rightEnd = b.length - suffix
    return [
        { kind: "removed", text: a, chords: mark(left.chords, right.chords, toRight), marks: leftEnd > prefix ? [[prefix, leftEnd]] : [] },
        { kind: "added", text: b, chords: mark(right.chords, left.chords, toLeft), marks: rightEnd > prefix ? [[prefix, rightEnd]] : [] }
    ]
}
