import { ApiError } from "../httpClient.js"

export function getSafeApiDetail(error) {
    if (!(error instanceof ApiError)) {
        return null
    }

    for (const candidate of getApiDetailCandidates(error.details)) {
        if (typeof candidate !== "string") {
            continue
        }

        const normalized = candidate.replace(/\s+/g, " ").trim()
        if (
            normalized === "" ||
            normalized.length > 240 ||
            /[<>]/.test(normalized) ||
            /\b(exception|stack trace)\b/i.test(normalized)
        ) {
            continue
        }
        return normalized
    }

    return null
}

export function getApiDetailCandidates(details) {
    if (typeof details === "string") {
        return [details]
    }
    if (
        details === null ||
        typeof details !== "object" ||
        Array.isArray(details)
    ) {
        return []
    }

    const candidates = [details.detail]
    if (
        details.errors !== null &&
        typeof details.errors === "object" &&
        !Array.isArray(details.errors)
    ) {
        for (const fieldErrors of Object.values(details.errors)) {
            if (Array.isArray(fieldErrors)) {
                candidates.push(...fieldErrors)
            } else {
                candidates.push(fieldErrors)
            }
        }
    }
    candidates.push(details.message, details.title)
    return candidates
}

export function toSentence(value) {
    return /[.!?]$/.test(value) ? value : `${value}.`
}

export function getAuthValidationMessage(error, fallback) {
    if (error instanceof ApiError && error.status === 400) {
        const detail = getSafeApiDetail(error)
        if (detail !== null) {
            return `${fallback} ${toSentence(detail)}`
        }
    }
    return fallback
}

export function getLoadSongBooksErrorMessage(error, hasStaleData = false) {
    const staleMessage = hasStaleData
        ? " The displayed list may be out of date."
        : ""
    if (error instanceof ApiError && error.status === null) {
        return "Could not reach the SongBook API. " +
            "Your song books could not be refreshed." +
            staleMessage
    }
    if (
        error instanceof ApiError &&
        error.status !== null &&
        error.status >= 500
    ) {
        return "The server could not load song books. Try again." +
            staleMessage
    }
    return "Could not load song books. Try again." + staleMessage
}

export function getSaveSongBookErrorMessage(error, mode) {
    const action = mode === "create" ? "create" : "rename"
    const pastAction = mode === "create" ? "created" : "renamed"
    if (error instanceof ApiError && error.status === 409) {
        return "You already have a song book with that name. " +
            "Choose a different name."
    }
    if (error instanceof ApiError && error.status === 400) {
        const detail = getSafeApiDetail(error)
        return detail === null
            ? `The song book could not be ${pastAction}. Check the name.`
            : `The song book could not be ${pastAction}. ` +
                toSentence(detail)
    }
    if (error instanceof ApiError && error.status === null) {
        return "Could not reach the SongBook API. " +
            "The entered name was kept."
    }
    return `Could not ${action} the song book. The entered name was kept.`
}

export function getDeleteSongBookErrorMessage(error) {
    if (error instanceof ApiError && error.status === null) {
        return "Could not reach the SongBook API. " +
            "The song book was not deleted."
    }
    return "Could not delete the song book. Try again."
}

export async function handleError(ctx, error, scope = null) {
    if (error?.name === "AbortError") {
        return false
    }
    if (error instanceof ApiError && error.status === 401) {
        await ctx.session.ended()
        return true
    }

    const scopeName = typeof scope === "string"
        ? scope
        : scope?.type ?? scope?.name
    if (
        (scopeName === "book" || scopeName === "songbooks") &&
        error instanceof ApiError &&
        [403, 404].includes(error.status)
    ) {
        ctx.cache.bookList = null
        await ctx.router.navigate("/", {
            replace: true,
            status: {
                type: "error",
                message: "That song book is no longer available to your account."
            }
        })
        return true
    }

    if (!(error instanceof ApiError)) {
        console.error(error)
        ctx.status.show("error", "Something went wrong. Try again.")
        return true
    }

    if (error.status === null) {
        ctx.status.show(
            "error",
            "Could not reach the SongBook API. Try again."
        )
    } else if (error.status === 400) {
        const detail = getSafeApiDetail(error)
        ctx.status.show(
            "error",
            detail === null
                ? "The API rejected the request. Try again."
                : toSentence(detail)
        )
    } else if (error.status === 403) {
        ctx.status.show(
            "error",
            "Your account is not allowed to make this change."
        )
    } else if (error.status === 404) {
        ctx.status.show("error", "The requested item could not be found.")
    } else if (error.status >= 500) {
        ctx.status.show(
            "error",
            "The server could not complete the request. Try again."
        )
    } else {
        ctx.status.show("error", "Something went wrong. Try again.")
    }
    return true
}
