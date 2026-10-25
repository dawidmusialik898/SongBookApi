import { readPage } from "../pagination.js"
import { h } from "./dom.js"

export function createPagedList({
    list,
    stateElement,
    moreButton,
    fetchPage,
    renderItem,
    getKey,
    messages,
    signal
}) {
    let currentItems = []
    let keys = new Set()
    let page = 0
    let hasNext = false
    let generation = 0
    let loading = false
    let activeController = null

    moreButton.addEventListener("click", () => loadMore())

    function abortCurrent() {
        activeController?.abort()
        activeController = null
    }

    async function reload() {
        generation += 1
        abortCurrent()
        loading = false
        currentItems = []
        keys = new Set()
        page = 0
        hasNext = false
        list.replaceChildren()
        stateElement.textContent = messages.loading
        moreButton.hidden = true
        moreButton.disabled = true
        return loadPage(1, generation)
    }

    async function loadMore() {
        if (loading || !hasNext || signal?.aborted) {
            return
        }
        return loadPage(page + 1, generation)
    }

    async function loadPage(requestedPage, requestGeneration) {
        if (signal?.aborted || requestGeneration !== generation) {
            return
        }

        const controller = new AbortController()
        const onParentAbort = () => controller.abort()
        if (signal !== undefined) {
            signal.addEventListener("abort", onParentAbort, { once: true })
        }
        activeController = controller
        loading = true
        list.setAttribute("aria-busy", "true")
        moreButton.disabled = true
        if (requestedPage > 1) {
            stateElement.textContent = "Loading more…"
        } else {
            stateElement.textContent = messages.loading
        }

        try {
            const result = readPage(
                await fetchPage(requestedPage, controller.signal),
                requestedPage
            )
            if (
                requestGeneration !== generation ||
                controller.signal.aborted
            ) {
                return
            }

            if (requestedPage === 1) {
                currentItems = []
                keys = new Set()
                list.replaceChildren()
            }

            const rows = []
            for (const item of result.items) {
                const key = getKey(item)
                if (keys.has(key)) {
                    continue
                }
                keys.add(key)
                currentItems.push(item)
                rows.push(renderItem(item))
            }
            for (const row of rows) {
                list.appendChild(row)
            }
            page = result.page
            hasNext = result.hasNext
            moreButton.hidden = !hasNext
            moreButton.disabled = false

            if (currentItems.length === 0) {
                const empty = typeof messages.empty === "function"
                    ? messages.empty()
                    : messages.empty
                stateElement.replaceChildren(
                    ...(Array.isArray(empty) ? empty : [empty])
                )
            } else {
                stateElement.replaceChildren()
            }
        } catch (error) {
            if (
                controller.signal.aborted ||
                signal?.aborted ||
                requestGeneration !== generation ||
                error?.name === "AbortError"
            ) {
                return
            }

            if (requestedPage === 1) {
                renderFirstPageError(error)
                moreButton.hidden = true
            } else {
                stateElement.textContent =
                    "Couldn't load more. Try again."
                moreButton.hidden = false
            }
            moreButton.disabled = false
        } finally {
            if (signal !== undefined) {
                signal.removeEventListener("abort", onParentAbort)
            }
            if (requestGeneration === generation) {
                loading = false
                activeController = null
                list.setAttribute("aria-busy", "false")
                if (!moreButton.hidden) {
                    moreButton.disabled = false
                }
            }
        }
    }

    function renderFirstPageError(error) {
        const text = typeof messages.error === "function"
            ? messages.error(error)
            : messages.error
        const retryButton = h("button", {
            className: "button button--neutral",
            type: "button",
            text: "Try again",
            on: { click: () => reload() }
        })
        stateElement.replaceChildren(
            h("span", { text }),
            retryButton
        )
    }

    function snapshot() {
        return {
            items: [...currentItems],
            page,
            hasNext
        }
    }

    function restore(value) {
        if (
            value === null ||
            typeof value !== "object" ||
            !Array.isArray(value.items) ||
            !Number.isSafeInteger(value.page) ||
            value.page < 0 ||
            typeof value.hasNext !== "boolean"
        ) {
            throw new TypeError("The list snapshot is invalid.")
        }

        generation += 1
        abortCurrent()
        loading = false
        currentItems = []
        keys = new Set()
        const rows = []
        for (const item of value.items) {
            const key = getKey(item)
            if (keys.has(key)) {
                continue
            }
            keys.add(key)
            currentItems.push(item)
            rows.push(renderItem(item))
        }
        page = value.page
        hasNext = value.hasNext
        list.replaceChildren(...rows)
        if (currentItems.length === 0 && page > 0) {
            const empty = typeof messages.empty === "function"
                ? messages.empty()
                : messages.empty
            stateElement.replaceChildren(
                ...(Array.isArray(empty) ? empty : [empty])
            )
        } else {
            stateElement.replaceChildren()
        }
        moreButton.hidden = !hasNext
        moreButton.disabled = false
        list.setAttribute("aria-busy", "false")
    }

    return {
        reload,
        loadMore,
        items: () => [...currentItems],
        snapshot,
        restore
    }
}
