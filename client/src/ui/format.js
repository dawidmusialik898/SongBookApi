export function displayValue(value, fallback = "") {
    return value !== null &&
        value !== undefined &&
        String(value).trim() !== ""
        ? String(value)
        : fallback
}

export function normalizeAccessLevel(value) {
    const normalized = String(value ?? "").trim().toLowerCase()
    return ["admin", "editor", "reader"].includes(normalized)
        ? normalized
        : null
}

export function formatAccessLevel(value) {
    const normalized = normalizeAccessLevel(value)
    if (normalized === null) {
        return "Unknown access"
    }

    return normalized[0].toUpperCase() + normalized.slice(1)
}

export function formatSongLabel(song) {
    const parts = []
    if (hasDisplayValue(song.number)) {
        parts.push(`${song.number}.`)
    }
    parts.push(displayValue(song.title, "Untitled song"))
    if (hasDisplayValue(song.author)) {
        parts.push(`— ${song.author}`)
    }
    return parts.join(" ")
}

export function formatCount(value, singular) {
    const count = Number.isFinite(Number(value))
        ? Number(value)
        : 0
    return `${count} ${singular}${count === 1 ? "" : "s"}`
}

export function formatDate(value) {
    const date = new Date(value)
    return Number.isNaN(date.getTime())
        ? ""
        : date.toLocaleString()
}

function hasDisplayValue(value) {
    return value !== null &&
        value !== undefined &&
        String(value).trim() !== ""
}
