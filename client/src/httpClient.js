let antiforgeryTokenPromise = null

export class ApiError extends Error {
    constructor(
        message,
        { status = null, details = null, cause } = {}
    ) {
        super(message, cause === undefined ? undefined : { cause })
        this.name = "ApiError"
        this.status = status
        this.details = details
    }
}

export async function request(url, options = {}) {
    const method = (options.method ?? "GET").toUpperCase()
    const responseType = options.responseType ?? "json"
    if (!["json", "blob"].includes(responseType)) {
        throw new TypeError("Unsupported response type.")
    }

    const headers = new Headers(options.headers ?? {})
    const fetchOptions = {
        ...options,
        credentials: "same-origin",
        headers,
        method
    }

    delete fetchOptions.json
    delete fetchOptions.responseType

    if (Object.hasOwn(options, "json")) {
        headers.set("Content-Type", "application/json")
        fetchOptions.body = JSON.stringify(options.json)
    }

    if (isUnsafeMethod(method)) {
        headers.set("X-CSRF-TOKEN", await getAntiforgeryToken())
    }

    return send(url, fetchOptions, responseType)
}

export function resetAntiforgeryToken() {
    antiforgeryTokenPromise = null
}

async function getAntiforgeryToken() {
    if (antiforgeryTokenPromise === null) {
        antiforgeryTokenPromise = send("/auth/antiforgery", {
            credentials: "same-origin",
            method: "GET"
        }).then(result => {
            if (
                result === null ||
                typeof result !== "object" ||
                typeof result.token !== "string" ||
                result.token === ""
            ) {
                throw new ApiError(
                    "The API returned an invalid antiforgery token."
                )
            }

            return result.token
        }).catch(error => {
            antiforgeryTokenPromise = null
            throw error
        })
    }

    return antiforgeryTokenPromise
}

async function send(url, options, responseType = "json") {
    let response

    try {
        response = await fetch(url, options)
    } catch (error) {
        if (error instanceof TypeError) {
            throw new ApiError(
                "Could not reach the SongBook API.",
                { cause: error }
            )
        }

        throw error
    }

    if (!response.ok) {
        const details = await readErrorDetails(response)

        throw new ApiError(
            `SongBook API request failed with status ${response.status}.`,
            {
                status: response.status,
                details
            }
        )
    }

    if (responseType === "blob") {
        return response.blob()
    }

    if (response.status === 204 || !isJsonResponse(response)) {
        return undefined
    }

    return response.json()
}

function isUnsafeMethod(method) {
    return !["GET", "HEAD", "OPTIONS", "TRACE"].includes(method)
}

function isJsonResponse(response) {
    const contentType = (
        response.headers.get("content-type") ?? ""
    ).toLowerCase()
    return contentType.includes("application/json") ||
        contentType.includes("+json")
}

async function readErrorDetails(response) {
    try {
        if (isJsonResponse(response)) {
            return await response.json()
        }

        const responseText = await response.text()
        return responseText.trim() === "" ? null : responseText
    } catch {
        return null
    }
}
