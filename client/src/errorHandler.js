import { ApiError } from "./httpClient.js"
import { getSongBook } from "./songBooksApi.js"
import {
    getLoadSongBookErrorMessage,
    getLoadSongErrorMessage,
    getSafeApiDetail,
    toSentence
} from "./ui/errors.js"

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
    } else if (error.status === 429) {
        ctx.status.show("error", "Too many attempts, try again later.")
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
