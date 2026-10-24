import { ApiError } from "./httpClient.js"

const PAGE_SIZE = 50

export function pageUrl(url, page) {
    if (!Number.isSafeInteger(page) || page < 1) {
        throw new TypeError("Page must be a positive integer.")
    }

    return page === 1 ? url : `${url}?page=${page}`
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

export async function fetchAvailablePage(fetchPage, requestedPage) {
    let result = readPage(
        await fetchPage(requestedPage),
        requestedPage
    )

    if (requestedPage > 1 && result.items.length === 0) {
        result = readPage(
            await fetchPage(requestedPage - 1),
            requestedPage - 1
        )
    }

    return result
}

export function renderPageControls(
    { container, previous, next, status },
    { page, hasNext, busy, available }
) {
    container.hidden = !available || (page === 1 && !hasNext)
    const label = `Page ${page}`
    if (status.textContent !== label) {
        status.textContent = label
    }
    previous.disabled = busy || page === 1
    next.disabled = busy || !hasNext
}
