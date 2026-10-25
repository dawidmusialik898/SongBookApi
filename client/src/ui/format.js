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
