import { ApiError } from "../httpClient.js"
import { getSongHistory, getSongSnapshot } from "../songsApi.js"
import { getSongBook } from "../songBooksApi.js"
import { compareSongSnapshots } from "../historyCompare.js"
import { readPage } from "../pagination.js"
import { h } from "../ui/dom.js"
import { revisionLabel } from "./historyScreen.js"

export async function renderHistoryCompareScreen(ctx) {
    const { bookId, songId } = ctx.params
    const historyHref = ctx.href("song-history", { bookId, songId })
    const heading = h("h1", { id: "screen-heading", text: "Compare revisions", attrs: { tabindex: "-1" } })
    const before = h("select", { id: "history-compare-before" })
    const after = h("select", { id: "history-compare-after" })
    const compareButton = h("button", {
        id: "history-compare", className: "button button--primary", type: "button", text: "Compare", disabled: true,
        on: { click: compare }
    })
    const more = h("button", {
        id: "history-compare-more", className: "button button--neutral", type: "button",
        text: "Load older revisions", hidden: true, on: { click: loadMore }
    })
    const backLink = h("a", {
        id: "history-compare-back", className: "button button--neutral",
        attrs: { href: historyHref }, text: "Back to history"
    })
    const form = h("div", { className: "history-compare-form" },
        h("div", { className: "form-field" },
            h("label", { text: "From revision", attrs: { for: "history-compare-before" } }), before),
        h("div", { className: "form-field" },
            h("label", { text: "To revision", attrs: { for: "history-compare-after" } }), after))
    const actions = h("div", { className: "screen-actions" }, compareButton, more, backLink)
    const feedback = h("p", { id: "history-compare-feedback", attrs: { role: "status" }, text: "Loading revisions…" })
    const result = h("section", { id: "history-compare-result", className: "history-preview", attrs: { "aria-live": "polite" } })
    ctx.root.replaceChildren(heading, form, actions, feedback, result)
    ctx.setTitle(["Compare revisions"])

    let page = 0
    let loading = false
    let generation = 0
    let activeController = null

    try {
        const book = await getSongBook(bookId, { signal: ctx.signal })
        if (!ctx.isCurrent()) return {}
        ctx.setTitle(["Compare revisions", book.name])
        ctx.setBreadcrumb([
            { text: book.name, href: ctx.href("book", { bookId }) },
            { text: "Song history", href: historyHref },
            { text: "Compare" }
        ])
        const items = await loadPage(1)
        if (ctx.isCurrent() && items?.length >= 2) {
            after.value = String(items[0].revision)
            before.value = String(items[1].revision)
            await compare()
        }
    } catch (error) {
        if (ctx.isCurrent() && error?.name !== "AbortError") await handleError(error)
    }
    return { focusTarget: heading, cleanup() { generation++; activeController?.abort() } }

    async function loadMore() {
        try {
            await loadPage(page + 1)
        } catch (error) {
            if (ctx.isCurrent() && error?.name !== "AbortError") await handleError(error)
        }
    }

    async function loadPage(requested) {
        if (loading || !ctx.isCurrent()) return
        loading = true
        more.disabled = true
        try {
            const response = await getSongHistory(bookId, songId, requested, { signal: ctx.signal })
            if (!ctx.isCurrent()) return
            const pageResult = readPage(response.revisions, requested)
            const previous = [before.value, after.value]
            for (const item of pageResult.items) {
                for (const select of [before, after]) {
                    select.appendChild(h("option", { attrs: { value: String(item.revision) }, text: revisionLabel(item) }))
                }
            }
            if (requested > 1) [before.value, after.value] = previous
            page = pageResult.page
            more.hidden = !pageResult.hasNext
            const count = before.children.length
            compareButton.disabled = count < 2
            if (requested === 1) {
                feedback.textContent = count < 2 ? "At least two tracked revisions are needed to compare." : ""
                if (count > 0) before.value = after.value = String(pageResult.items[0].revision)
            }
            return pageResult.items
        } finally {
            if (ctx.isCurrent()) { loading = false; more.disabled = false }
        }
    }

    async function compare() {
        if (!ctx.isCurrent() || !before.value || !after.value) return
        activeController?.abort()
        const controller = new AbortController()
        activeController = controller
        const onAbort = () => controller.abort()
        ctx.signal.addEventListener("abort", onAbort, { once: true })
        const token = ++generation
        const current = () => ctx.isCurrent() && !controller.signal.aborted && token === generation
        const from = before.value
        const to = after.value
        feedback.textContent = "Loading snapshots…"
        try {
            const [left, right] = await Promise.all([
                getSongSnapshot(bookId, songId, from, { signal: controller.signal }),
                getSongSnapshot(bookId, songId, to, { signal: controller.signal })
            ])
            if (!current()) return
            renderComparison(result, compareSongSnapshots(left.snapshot.song, right.snapshot.song), from, to)
            feedback.textContent = ""
        } catch (error) {
            if (current() && error?.name !== "AbortError") await handleError(error)
        } finally { ctx.signal.removeEventListener("abort", onAbort) }
    }

    async function handleError(error) {
        if (error instanceof ApiError && [401, 403, 404].includes(error.status)) {
            await ctx.handleError(error, { type: "book", bookId, signal: ctx.signal, isCurrent: ctx.isCurrent })
        } else {
            feedback.textContent = "Revisions could not be loaded. Try again."
            if (!(error instanceof ApiError)) await ctx.handleError(error, "programmer")
        }
    }
}

const STATUS_LABELS = { added: "Added", removed: "Removed", changed: "Changed" }
const ROW_TAGS = { removed: "Before", added: "After", same: "" }

function renderComparison(container, comparison, from, to) {
    container.replaceChildren(h("h2", { text: `Changes from revision ${from} to ${to}` }))
    if (!comparison.hasChanges) {
        container.appendChild(h("p", { className: "compare-note", text: "Nothing changed between these revisions." }))
        return
    }
    if (comparison.fields.length > 0) {
        const details = h("dl", { className: "compare-details" })
        for (const field of comparison.fields) {
            details.appendChild(h("dt", { text: field.label }))
            details.appendChild(h("dd", {},
                valueElement("del", "compare-old", field.before),
                h("span", { className: "compare-arrow", text: " → " }),
                valueElement("ins", "compare-new", field.after)))
        }
        container.appendChild(h("section", { className: "compare-card" },
            h("h3", { className: "compare-card__title", text: "Song details" }), details))
    }
    for (const part of comparison.parts) {
        const notes = []
        if (part.previousName) notes.push(`Renamed from “${part.previousName}”.`)
        if (part.status === "changed" && part.previousPosition) {
            notes.push(`Moved from position ${part.previousPosition} to ${part.position}.`)
        }
        const card = h("section", { className: `compare-card compare-card--${part.status}` },
            h("div", { className: "compare-card__header" },
                h("h3", { className: "compare-card__title", text: part.name }),
                h("span", { className: `compare-badge compare-badge--${part.status}`, text: STATUS_LABELS[part.status] })),
            ...notes.map(text => h("p", { className: "compare-note", text })))
        if (part.rows.length > 0) {
            const lines = h("div", { className: "compare-lines" })
            const tagged = part.status === "changed"
            for (const row of part.rows) lines.appendChild(diffRow(row, tagged))
            card.appendChild(lines)
        }
        container.appendChild(card)
    }
    if (comparison.unchangedParts.length > 0) {
        container.appendChild(h("p", { className: "compare-note",
            text: `Unchanged: ${comparison.unchangedParts.join(", ")}.` }))
    }
}

function valueElement(tagName, className, value) {
    return value === null
        ? h("span", { className: `${className} compare-value--empty`, text: "(empty)" })
        : h(tagName, { className, text: value })
}

function diffRow(row, tagged) {
    return h("div", { className: `compare-line compare-line--${row.kind}` },
        h("span", { className: "compare-line__tag", text: tagged ? ROW_TAGS[row.kind] : "" }),
        h("div", { className: "chorded-text" }, diffLine(row)))
}

function diffLine(row) {
    const markTag = row.kind === "removed" ? "del" : "ins"
    const lyric = (start, end) => {
        const pieces = []
        let cursor = start
        for (const [markStart, markEnd] of row.marks) {
            const from = Math.max(markStart, start)
            const until = Math.min(markEnd, end)
            if (from >= until) continue
            if (from > cursor) pieces.push(row.text.slice(cursor, from))
            pieces.push(h(markTag, { className: "compare-mark", text: row.text.slice(from, until) }))
            cursor = until
        }
        if (cursor < end) pieces.push(row.text.slice(cursor, end))
        return pieces
    }
    if (row.chords.length === 0) {
        const pieces = lyric(0, row.text.length)
        return h("div", { className: "chord-line" }, ...(pieces.length === 0 ? ["\u00a0"] : pieces))
    }
    const cell = (start, end, chord) => h("span", { className: "chord-cell" },
        h("span", {
            className: chord?.changed ? "chord-cell__symbol chord-cell__symbol--changed" : "chord-cell__symbol",
            text: chord?.symbol ?? ""
        }),
        h("span", { className: "chord-cell__lyric" }, ...lyric(start, end)))
    const line = h("div", { className: "chord-line" })
    if (row.chords[0].offset > 0) line.appendChild(cell(0, row.chords[0].offset, null))
    for (const [index, chord] of row.chords.entries()) {
        line.appendChild(cell(chord.offset, row.chords[index + 1]?.offset ?? row.text.length, chord))
    }
    return line
}
