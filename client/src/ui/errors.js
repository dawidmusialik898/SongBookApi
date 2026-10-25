import { ApiError } from "../httpClient.js"
import { getSongBook } from "../songBooksApi.js"

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

export function getLoadSongBookErrorMessage(error) {
    if (error instanceof ApiError && error.status === null) {
        return "Could not reach the SongBook API. " +
            "Open the song book again to retry."
    }
    if (error instanceof ApiError && error.status >= 500) {
        return "The server could not load the selected song book. Try again."
    }
    return "Could not load the selected song book. Try again."
}

export function getLoadSongsErrorMessage(error) {
    if (error instanceof ApiError && error.status === null) {
        return "Could not reach the SongBook API. " +
            "Check that it is running, then try again."
    }
    if (error instanceof ApiError && error.status === 400) {
        return "The API rejected the request to load songs. Try again."
    }
    if (error instanceof ApiError && error.status >= 500) {
        return "The server could not load songs. Try again."
    }
    return "Could not load songs. Try again."
}

export function getLoadSongErrorMessage(error) {
    if (error instanceof ApiError && error.status === null) {
        return "Could not reach the SongBook API. " +
            "Select the song again to retry."
    }
    if (error instanceof ApiError && error.status === 400) {
        return "The API rejected the request for song details. " +
            "Select the song again to retry."
    }
    if (error instanceof ApiError && error.status >= 500) {
        return "The server could not load song details. " +
            "Select the song again to retry."
    }
    return "Could not load song details. Select the song again to retry."
}

export function getDeleteSongErrorMessage(error) {
    if (error instanceof ApiError && error.status === null) {
        return "Could not reach the SongBook API. " +
            "The song was not deleted. Try again."
    }
    if (error instanceof ApiError && error.status === 400) {
        return "The API rejected the delete request. " +
            "The song was not deleted. Try again."
    }
    if (error instanceof ApiError && error.status >= 500) {
        return "The server could not delete the song. " +
            "The song remains available. Try again."
    }
    return "Could not delete the song. Try again."
}

export async function handleError(ctx, error, scope = null) {
    if (error?.name === "AbortError") {
        return false
    }
    const scopeOptions = typeof scope === "string"
        ? { type: scope }
        : scope !== null && typeof scope === "object"
            ? scope
            : {}
    if (
        typeof scopeOptions.isCurrent === "function" &&
        !scopeOptions.isCurrent()
    ) {
        return true
    }
    if (error instanceof ApiError && error.status === 401) {
        await ctx.session.ended()
        return true
    }

    const scopeName = scopeOptions.type ?? scopeOptions.name
    const bookId = scopeOptions.bookId ??
        ctx.router.current?.params?.bookId
    if (
        (scopeName === "book" || scopeName === "songbooks") &&
        error instanceof ApiError &&
        [403, 404].includes(error.status)
    ) {
        return handleUnavailableBook(ctx, scopeOptions)
    }

    if (
        scopeName === "song" &&
        error instanceof ApiError &&
        error.status === 404
    ) {
        return handleMissingSong(ctx, scopeOptions, bookId)
    }

    if (
        scopeName === "mutation" &&
        error instanceof ApiError &&
        error.status === 403
    ) {
        return handleForbiddenMutation(ctx, scopeOptions, bookId)
    }

    if (
        scopeName === "mutation" &&
        error instanceof ApiError &&
        error.status === 404
    ) {
        return handleUnavailableBook(ctx, scopeOptions)
    }

    if (
        scopeName === "book" &&
        error instanceof ApiError
    ) {
        ctx.status.show("error", getLoadSongBookErrorMessage(error))
        return true
    }

    if (
        scopeName === "song" &&
        error instanceof ApiError
    ) {
        ctx.status.show("error", getLoadSongErrorMessage(error))
        return true
    }

    if (scopeName === "adjacent") {
        return true
    }

    return handleGenericError(ctx, error)
}

async function handleUnavailableBook(ctx, scope = {}) {
    scope.onBookUnavailable?.()
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

async function handleMissingSong(ctx, scope, bookId) {
    if (bookId === null || bookId === undefined) {
        return handleGenericError(ctx, new ApiError(
            "The song could not be found.",
            { status: 404 }
        ))
    }

    try {
        await getSongBook(bookId, { signal: scope.signal })
    } catch (bookError) {
        if (
            bookError?.name === "AbortError" ||
            (
                typeof scope.isCurrent === "function" &&
                !scope.isCurrent()
            )
        ) {
            return true
        }
        if (
            bookError instanceof ApiError &&
            bookError.status === 401
        ) {
            await ctx.session.ended()
            return true
        }
        if (
            bookError instanceof ApiError &&
            [403, 404].includes(bookError.status)
        ) {
            return handleUnavailableBook(ctx, scope)
        }
        return handleError(ctx, bookError, {
            type: "book-refresh",
            isCurrent: scope.isCurrent
        })
    }

    if (
        typeof scope.isCurrent === "function" &&
        !scope.isCurrent()
    ) {
        return true
    }

    ctx.cache.bookList = null
    await ctx.router.navigate(
        ctx.router.href("book", { bookId }),
        {
            replace: true,
            status: {
                type: "error",
                message: "This song no longer exists. It may have been deleted."
            }
        }
    )
    return true
}

async function handleForbiddenMutation(ctx, scope, bookId) {
    if (bookId === null || bookId === undefined) {
        return handleGenericError(ctx, new ApiError(
            "The operation is not allowed.",
            { status: 403 }
        ))
    }

    try {
        await getSongBook(bookId, { signal: scope.signal })
    } catch (bookError) {
        if (
            bookError?.name === "AbortError" ||
            (
                typeof scope.isCurrent === "function" &&
                !scope.isCurrent()
            )
        ) {
            return true
        }
        if (
            bookError instanceof ApiError &&
            bookError.status === 401
        ) {
            await ctx.session.ended()
            return true
        }
        if (
            bookError instanceof ApiError &&
            [403, 404].includes(bookError.status)
        ) {
            return handleUnavailableBook(ctx, scope)
        }
        return handleError(ctx, bookError, {
            type: "book-refresh",
            isCurrent: scope.isCurrent
        })
    }

    if (
        typeof scope.isCurrent === "function" &&
        !scope.isCurrent()
    ) {
        return true
    }

    const path = scope.path ?? ctx.router.current?.path ??
        ctx.router.href("book", { bookId })
    await ctx.router.navigate(path, {
        replace: true,
        status: {
            type: "error",
            message: "Your account is not allowed to make this change."
        }
    })
    return true
}

function handleGenericError(ctx, error) {
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
