import { ApiError } from "./httpClient.js"

const PAGE_SIZE = 50

export function pageUrl(url, page, params = {}) {
    if (!Number.isSafeInteger(page) || page < 1) {
        throw new TypeError("Page must be a positive integer.")
    }

    const query = new URLSearchParams()
    if (page > 1) {
        query.set("page", String(page))
    }

    for (const [name, value] of Object.entries(params)) {
        if (value === undefined || value === null || value === "") {
            continue
        }

        query.append(name, String(value))
    }

    const queryString = query.toString()
    if (queryString === "") {
        return url
    }

    return `${url}${url.includes("?") ? "&" : "?"}${queryString}`
}

export function readPage(value, expectedPage) {
    if (
        value === null ||
        typeof value !== "object" ||
        !Array.isArray(value.items) ||
        value.items.length > PAGE_SIZE ||
        value.page !== expectedPage ||
        typeof value.hasNext !== "boolean" ||
        (value.items.length === 0 && value.hasNext)
    ) {
        throw new ApiError("The API returned an invalid collection page.")
    }

    return value
}
