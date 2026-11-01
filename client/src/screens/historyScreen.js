import { ApiError } from "../httpClient.js"
import { getBookHistory, getSongHistory, getSongSnapshot, restoreSong } from "../songsApi.js"
import { getSongBook } from "../songBooksApi.js"
import { DETAIL_FIELDS, partDisplayName } from "../historyCompare.js"
import { renderChordedText } from "../chords.js"
import { h } from "../ui/dom.js"
import { createPagedList } from "../ui/pagedList.js"
import { normalizeAccessLevel } from "../ui/format.js"

export async function renderHistoryScreen(ctx) {
    const { bookId, songId } = ctx.params
    const heading = h("h1", { id: "screen-heading", text: "History", attrs: { tabindex: "-1" } })
    const notice = h("p", { id: "history-notice" })
    const list = h("ul", { id: "history-list", className: "row-list" })
    const state = h("p", { id: "history-state", text: "Loading history…" })
    const more = h("button", { id: "history-more", className: "button button--neutral", type: "button", text: "Show more", hidden: true })
    const controls = h("div", { id: "history-controls", className: "history-controls", hidden: true })
    const preview = h("section", { id: "history-preview", className: "history-preview", attrs: { "aria-live": "polite" } })
    const feedback = h("p", { id: "history-feedback", attrs: { role: "status" } })
    const logHeading = h("h2", { id: "history-log-heading", text: "Activity", hidden: !songId })
    ctx.root.replaceChildren(heading, notice, controls, feedback, preview, logHeading, list, state, more)
    ctx.setTitle(["History"])
    let latest = 0
    let deleted = false
    let canRestore = false
    let selectedRevision = null
    let busy = false
    let generation = 0
    let activeController = null
    const revisionSelect = h("select", { id: "history-revision", on: { change: () => showRevision(Number(revisionSelect.value)) } })
    const restoreButton = h("button", { id: "history-restore", className: "button button--primary", type: "button", text: "Restore this revision", hidden: true, on: { click: restore } })
    const compareLink = songId ? h("a", {
        id: "history-compare-link", className: "button button--neutral",
        attrs: { href: ctx.href("song-history-compare", { bookId, songId }) }, text: "Compare revisions"
    }) : null
    if (songId) {
        controls.appendChild(h("div", { className: "form-field history-controls__select" },
            h("label", { text: "Revision", attrs: { for: "history-revision" } }), revisionSelect))
        controls.appendChild(h("div", { className: "screen-actions" }, restoreButton, compareLink))
    }

    const paged = createPagedList({
        list, stateElement: state, moreButton: more, signal: ctx.signal,
        fetchPage: async (page, signal) => {
            try {
                if (!songId) return await getBookHistory(bookId, page, { signal })
                const result = await getSongHistory(bookId, songId, page, { signal })
                if (ctx.isCurrent() && !signal.aborted) {
                    latest = result.latestRevision
                    deleted = result.deleted
                    notice.textContent = deleted
                        ? "This song is deleted. Editors can recover its content below."
                        : latest === 0 ? "Tracking starts with the next change. Earlier history is unknown." : "Revisions are retained until the book is deleted."
                }
                return result.revisions
            } catch (error) {
                if (ctx.isCurrent() && !signal.aborted && error?.name !== "AbortError") await handleError(error)
                throw error
            }
        },
        renderItem: item => songId ? revisionRow(item) : activityRow(item),
        getKey: item => item.id ?? item.revision,
        messages: {
            loading: "Loading history…",
            empty: "No tracked history yet. Existing songs get an unknown baseline at their next change.",
            error: () => "History could not be loaded. Try again."
        }
    })
    try {
        const book = await getSongBook(bookId, { signal: ctx.signal })
        if (!ctx.isCurrent()) return {}
        canRestore = ["admin", "editor"].includes(normalizeAccessLevel(book.accessLevel))
        heading.textContent = songId ? "Song history" : "Book history"
        ctx.setTitle([heading.textContent, book.name])
        ctx.setBreadcrumb([{ text: book.name, href: ctx.href("book", { bookId }) }, { text: heading.textContent }])
        await paged.reload()
        controls.hidden = !songId || latest === 0
        if (ctx.isCurrent() && songId && latest > 0) await showRevision(latest)
    } catch (error) {
        if (ctx.isCurrent() && error?.name !== "AbortError") await handleError(error)
    }
    return { focusTarget: heading, cleanup() { generation++; activeController?.abort(); paged.destroy() } }

    function activityRow(item) {
        const row = h("li", { className: "row" },
            h("p", { text: `${item.operation} · ${item.actor} · ${formatTime(item.occurredAtUtc)}` }),
            item.subject == null ? "" : h("p", { text: `Collaborator: ${item.subject}` }),
            h("p", { text: item.description ?? "" }))
        if (item.songId) row.appendChild(h("a", {
            attrs: { href: ctx.href("song-history", { bookId, songId: item.songId }) },
            text: item.operation === "song.deleted" ? "View history / recover deleted song" : "View song history"
        }))
        return row
    }

    function revisionRow(item) {
        revisionSelect.appendChild(h("option", { attrs: { value: String(item.revision) }, text: revisionLabel(item) }))
        if (selectedRevision !== null) revisionSelect.value = String(selectedRevision)
        return h("li", { className: "row", dataset: { revision: item.revision } },
            h("p", { text: `Revision ${item.revision} · ${item.operation} · ${item.actor} · ${formatTime(item.occurredAtUtc)}` }),
            item.restoredFromRevision == null ? "" : h("p", { text: `Restored from revision ${item.restoredFromRevision}` }))
    }

    function startPreview() {
        activeController?.abort()
        activeController = new AbortController()
        const controller = activeController
        const onAbort = () => controller.abort()
        ctx.signal.addEventListener("abort", onAbort, { once: true })
        const token = ++generation
        feedback.textContent = "Loading snapshot…"
        return {
            signal: controller.signal,
            current: () => ctx.isCurrent() && !controller.signal.aborted && token === generation,
            done: () => ctx.signal.removeEventListener("abort", onAbort)
        }
    }

    async function showRevision(revision) {
        if (!ctx.isCurrent()) return
        if (busy || !Number.isSafeInteger(revision) || revision <= 0) {
            if (selectedRevision !== null) revisionSelect.value = String(selectedRevision)
            return
        }
        const request = startPreview()
        revisionSelect.value = String(revision)
        restoreButton.hidden = true
        try {
            const detail = await getSongSnapshot(bookId, songId, revision, { signal: request.signal })
            if (!request.current()) return
            selectedRevision = revision
            renderSnapshot(detail.snapshot.song, revision)
            restoreButton.hidden = !canRestore
            feedback.textContent = ""
        } catch (error) {
            if (request.current() && error?.name !== "AbortError") {
                if (selectedRevision !== null) {
                    revisionSelect.value = String(selectedRevision)
                    restoreButton.hidden = !canRestore
                }
                await handleError(error)
            }
        } finally { request.done() }
    }

    function renderSnapshot(song, revision) {
        preview.replaceChildren(h("h2", { text: `Revision ${revision}: ${song.title ?? "Untitled song"}` }))
        const details = h("dl", { className: "compare-details" })
        for (const [field, label] of DETAIL_FIELDS) {
            if (field === "title" || song[field] == null || String(song[field]).trim() === "") continue
            details.appendChild(h("dt", { text: label }))
            details.appendChild(h("dd", { text: String(song[field]) }))
        }
        if (details.children.length > 0) preview.appendChild(details)
        for (const [index, part] of song.parts.entries()) {
            const section = h("section", { className: "song-part" }, h("h3", { className: "song-part__name", text: partDisplayName(part, index) }))
            const lyrics = h("div", { className: "chorded-text" })
            renderChordedText(lyrics, part.text ?? "", part.chords ?? [])
            section.appendChild(lyrics)
            preview.appendChild(section)
        }
    }

    async function restore() {
        if (busy || selectedRevision === null || !canRestore || !ctx.isCurrent()) return
        busy = true
        activeController?.abort()
        generation++
        restoreButton.disabled = true
        revisionSelect.disabled = true
        const revision = selectedRevision
        const expected = latest
        try {
            const confirmed = await ctx.dialogs.confirmDialog({
                title: deleted ? "Recover deleted song?" : "Restore this revision?",
                message: `Restore the previewed revision ${revision} over ${deleted ? "the deleted state" : `latest revision ${expected}`}? This appends a new revision; all earlier history remains.`,
                confirmLabel: deleted ? "Recover song" : "Restore revision", cancelLabel: "Cancel"
            })
            if (!confirmed || !ctx.isCurrent()) return
            activeController?.abort()
            generation++
            await restoreSong(bookId, songId, revision, expected, { signal: ctx.signal })
            if (!ctx.isCurrent()) return
            ctx.cache.bookList = null
            await ctx.navigate(ctx.href("song", { bookId, songId }), { status: "Song restored. Earlier revisions were kept." })
        } catch (error) {
            if (ctx.isCurrent() && error?.name !== "AbortError") {
                if (error instanceof ApiError && error.status === 409) {
                    feedback.textContent = "The song changed or this snapshot cannot be restored. Reload history and compare before trying again."
                    canRestore = false
                    restoreButton.hidden = true
                    feedback.appendChild(h("button", { type: "button", text: "Reload history",
                        on: { click: () => ctx.navigate(ctx.href("song-history", { bookId, songId }), { replace: true }) } }))
                } else await handleError(error)
            }
        } finally {
            if (ctx.isCurrent()) { busy = false; restoreButton.disabled = false; revisionSelect.disabled = false }
        }
    }

    async function handleError(error) {
        if (error instanceof ApiError && [401, 403, 404].includes(error.status)) {
            await ctx.handleError(error, { type: "book", bookId, signal: ctx.signal, isCurrent: ctx.isCurrent })
        } else {
            feedback.textContent = "History could not be loaded or restored. Try again."
            if (!(error instanceof ApiError)) await ctx.handleError(error, "programmer")
        }
    }
}

export function formatTime(value) {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? "Unknown time" : date.toLocaleString()
}

export function revisionLabel(item) {
    return `Revision ${item.revision} · ${item.operation} · ${formatTime(item.occurredAtUtc)}`
}
