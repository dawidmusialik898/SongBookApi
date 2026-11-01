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

export function getLoadSongBooksErrorMessage(error) {
    if (error instanceof ApiError && error.status === null) {
        return "Could not reach the SongBook API. " +
            "Your song books could not be loaded. Try again."
    }
    if (
        error instanceof ApiError &&
        error.status !== null &&
        error.status >= 500
    ) {
        return "The server could not load song books. Try again."
    }
    return "Could not load song books. Try again."
}

export function getCopySongErrorMessage(error) {
    if (error instanceof ApiError && error.status === 403) {
        return "You can no longer edit the destination song book. Choose another destination."
    }
    if (error instanceof ApiError && error.status === 404) {
        return "The source song or destination book is no longer accessible. Your selection was kept."
    }
    if (error instanceof ApiError && error.status === 400) {
        return getAuthValidationMessage(error, "The song could not be copied. Your selection was kept.")
    }
    return "Could not copy the song. Your selection was kept. Try again."
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

export function getLoadPdfsErrorMessage(error) {
    if (error instanceof ApiError && error.status === null) {
        return "Could not reach the SongBook API. " +
            "PDF exports could not be loaded. Try again."
    }
    if (error instanceof ApiError && error.status >= 500) {
        return "The server could not load PDF exports. Try again."
    }
    return "Could not load PDF exports. Try again."
}

export function getGeneratePdfErrorMessage(error) {
    if (error instanceof ApiError && error.status === 400) {
        const detail = getSafeApiDetail(error)
        return detail === null
            ? "The PDF request was rejected. Check the selected songs."
            : `The PDF request was rejected. ${toSentence(detail)}`
    }
    if (error instanceof ApiError && error.status === null) {
        return "Could not generate the PDF. It may have been created; " +
            "try again."
    }
    return "Could not generate the PDF. Try again."
}

export function getDownloadPdfErrorMessage(error) {
    if (error instanceof ApiError && error.status === null) {
        return "Could not reach the SongBook API. " +
            "Try downloading the PDF again."
    }
    return "Could not download the PDF. Try again."
}

export function getLoadCollaboratorsErrorMessage(error) {
    if (error instanceof ApiError && error.status === null) {
        return "Could not reach the SongBook API. " +
            "Collaborators could not be loaded. Try again."
    }
    if (error instanceof ApiError && error.status >= 500) {
        return "The server could not load collaborators. Try again."
    }
    return "Could not load collaborators. Try again."
}

export function getSongBookAccessErrorMessage(error) {
    if (error instanceof ApiError && error.status === 400) {
        const detail = getSafeApiDetail(error)
        return detail === null
            ? "The collaborator access request was rejected."
            : "The collaborator access request was rejected. " +
                toSentence(detail)
    }
    if (error instanceof ApiError && error.status === null) {
        return "Could not reach the SongBook API. " +
            "The collaborator change was not saved."
    }
    return "Could not update collaborator access. Try again."
}

export function getLoadUsersErrorMessage(error) {
    if (error instanceof ApiError && error.status === null) {
        return "Could not reach the SongBook API. " +
            "User accounts could not be loaded. Try again."
    }
    if (error instanceof ApiError && error.status >= 500) {
        return "The server could not load users. Try again."
    }
    return "Could not load users. Try again."
}

export function getManagedUserActionErrorMessage(error) {
    if (error instanceof ApiError && error.status === 400) {
        const detail = getSafeApiDetail(error)
        return detail === null
            ? "The account could not be updated. Try again."
            : `The account could not be updated. ${toSentence(detail)}`
    }
    if (error instanceof ApiError && error.status === null) {
        return "Could not reach the SongBook API. " +
            "The account may have been updated. Try again."
    }
    return "The account could not be updated. Try again."
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

export function getSaveSongErrorMessage(error, mode) {
    const keptDraft = mode === "create"
        ? "Your new song draft was kept."
        : "Your changes were kept."
    if (error instanceof ApiError && error.status === 400) {
        const detail = getSafeApiDetail(error)
        return "The API rejected the submitted song." +
            (detail === null ? "" : ` ${toSentence(detail)}`) +
            " Review the entered values and try again. " +
            keptDraft
    }
    if (error instanceof ApiError && error.status === null) {
        return "Could not reach the SongBook API. " +
            `${keptDraft} Try again.`
    }
    if (
        error instanceof ApiError &&
        error.status !== null &&
        error.status >= 500
    ) {
        return mode === "create"
            ? "The server could not create the song. " +
                `${keptDraft} Try again.`
            : "The server could not save the changes. " +
                `${keptDraft} Try again.`
    }
    return mode === "create"
        ? "Could not create the song. Your new song draft was kept. Try again."
        : "Could not save the changes. Your changes were kept. Try again."
}

export function isUnavailableBookError(error) {
    return error instanceof ApiError &&
        [403, 404].includes(error.status)
}
