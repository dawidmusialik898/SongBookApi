import { ApiError } from "../httpClient.js"
import {
    downloadSongBookPdf,
    getSongBook,
    getSongBookPdfs
} from "../songBooksApi.js"
import { readPage } from "../pagination.js"
import { findActionTarget, h, hasLostFocus } from "../ui/dom.js"
import {
    getDownloadPdfErrorMessage,
    getLoadPdfsErrorMessage
} from "../ui/errors.js"
import {
    displayValue,
    formatDate,
    normalizeAccessLevel
} from "../ui/format.js"
import { createPagedList } from "../ui/pagedList.js"
import { downloadPdf, readPdfMetadata } from "../ui/pdf.js"

export async function renderPdfListScreen(ctx) {
    const readBook = ctx.readApi?.getSongBook ?? getSongBook
    const readPdfs = ctx.readApi?.getSongBookPdfs ?? getSongBookPdfs
    const download = ctx.readApi?.downloadSongBookPdf ?? downloadSongBookPdf
    const bookId = ctx.params.bookId
    let bookName = "Untitled song book"
    let accessLevel = null
    let isDownloading = false
    const downloadButtons = new Set()

    ctx.setTitle(["PDF exports"])
    ctx.setBreadcrumb([{ text: "PDF exports" }])

    const heading = h("h1", {
        id: "screen-heading",
        attrs: { tabindex: "-1" },
        text: "PDF exports"
    })
    const actions = h("div", { className: "screen-actions" })
    const header = h("header", {
        className: "screen-header"
    }, heading, actions)
    const list = h("ul", {
        id: "pdf-list",
        className: "row-list pdf-list",
        hidden: true
    })
    const stateElement = h("p", {
        id: "pdf-list-state",
        className: "list-state",
        text: "Loading PDF exports…"
    })
    const moreButton = h("button", {
        id: "show-more-pdfs",
        className: "button button--neutral",
        type: "button",
        attrs: { "aria-label": "Show more PDFs" },
        hidden: true,
        disabled: true,
        text: "Show more"
    })
    const retentionHint = h("p", {
        id: "pdf-retention-hint",
        className: "screen-hint",
        text: "Only the 20 most recent PDFs are kept for each song book."
    })
    ctx.root.replaceChildren(header, retentionHint, list, stateElement, moreButton)

    const pagedList = createPagedList({
        list,
        stateElement,
        moreButton,
        fetchPage: async (page, signal) => {
            try {
                const result = readPage(
                    await readPdfs(bookId, page, { signal }),
                    page
                )
                return {
                    ...result,
                    items: result.items.map(readPdfMetadata)
                }
            } catch (error) {
                if (
                    error instanceof ApiError &&
                    [401, 403, 404].includes(error.status)
                ) {
                    await handleBookError(error)
                }
                throw error
            }
        },
        renderItem: pdf => renderPdfItem(pdf),
        getKey: pdf => pdf.id,
        messages: {
            loading: "Loading PDF exports…",
            empty: () => renderEmptyState(),
            error: error => getLoadPdfsErrorMessage(error)
        },
        signal: ctx.signal
    })
    list.addEventListener("click", event => handleDownloadClick(event))

    const [bookResult, pdfResult] = await Promise.allSettled([
        readBook(bookId, { signal: ctx.signal }),
        readPdfs(bookId, 1, { signal: ctx.signal })
    ])
    if (!ctx.isCurrent()) {
        return { focusTarget: heading }
    }
    if (bookResult.status === "rejected") {
        stateElement.replaceChildren()
        await ctx.handleError(bookResult.reason, bookScope())
        return { focusTarget: heading }
    }

    const book = bookResult.value
    if (book === null || typeof book !== "object") {
        stateElement.replaceChildren()
        await ctx.handleError(
            new TypeError("The API returned an invalid song book.")
        )
        return { focusTarget: heading }
    }

    bookName = displayValue(book.name, "Untitled song book")
    accessLevel = ctx.publicRead ? "reader" : normalizeAccessLevel(book.accessLevel)
    ctx.setTitle(["PDF exports", bookName])
    ctx.setBreadcrumb([
        {
            text: bookName,
            href: ctx.href("book", { bookId })
        },
        { text: "PDF exports" }
    ])
    renderActions()
    list.hidden = false

    if (pdfResult.status === "rejected") {
        if (
            pdfResult.reason instanceof ApiError &&
            [401, 403, 404].includes(pdfResult.reason.status)
        ) {
            await handleBookError(pdfResult.reason)
        } else {
            renderFirstPageError(pdfResult.reason)
        }
        return { focusTarget: heading }
    }

    try {
        const page = readPage(pdfResult.value, 1)
        pagedList.restore({
            ...page,
            items: page.items.map(readPdfMetadata)
        })
    } catch (error) {
        renderFirstPageError(error)
    }

    return { focusTarget: heading }

    function renderActions() {
        if (accessLevel !== "admin") {
            return
        }
        actions.appendChild(h("a", {
            id: "new-pdf-link",
            className: "button button--primary",
            attrs: {
                href: ctx.href("pdf-new", { bookId })
            },
            text: "New PDF"
        }))
    }

    function renderEmptyState() {
        return h("span", {},
            "No PDFs yet.",
            accessLevel === "admin"
                ? h("span", {},
                    " ",
                    h("a", {
                        id: "create-first-pdf-link",
                        attrs: {
                            href: ctx.href("pdf-new", { bookId })
                        },
                        text: "Create the first PDF"
                    }))
                : null
        )
    }

    function renderFirstPageError(error) {
        if (!ctx.isCurrent()) {
            return
        }
        const retryButton = h("button", {
            className: "button button--neutral",
            type: "button",
            text: "Try again",
            on: { click: () => pagedList.reload() }
        })
        stateElement.replaceChildren(
            h("span", { text: getLoadPdfsErrorMessage(error) }),
            retryButton
        )
        moreButton.hidden = true
        moreButton.disabled = true
    }

    function renderPdfItem(value) {
        const pdf = readPdfMetadata(value)
        const createdDate = formatDate(pdf.generatedAtUtc)
        const variant = pdf.includeChords ? "with chords" : "lyrics only"
        const title = pdf.isWholeBook
            ? `Entire book · ${variant}`
            : `${formatSelectedSongCount(pdf.songCount)} · ${variant}`
        const outdatedBadge = pdf.isOutdated
            ? h("span", {
                className: "badge badge--warning"
            },
            "Outdated",
            h("span", {
                className: "visually-hidden",
                text: " The book changed after this PDF was created."
            }))
            : null
        const songSummary = pdf.isWholeBook
            ? null
            : renderSelectedSongSummary(pdf)
        const downloadButton = h("button", {
            className: "button button--neutral",
            type: "button",
            dataset: {
                action: "download-pdf",
                pdfId: pdf.id
            },
            attrs: {
                "aria-label": `Download PDF created ${createdDate}`
            },
            disabled: isDownloading,
            text: "Download"
        })
        downloadButtons.add(downloadButton)

        return h("li", {
            className: "pdf-item",
            dataset: { pdfId: pdf.id }
        },
        h("div", { className: "pdf-item__heading" },
            h("span", {
                className: "pdf-item__title",
                text: title
            }),
            outdatedBadge
        ),
        songSummary,
        h("p", { className: "pdf-item__meta" },
            h("time", {
                attrs: { datetime: pdf.generatedAtUtc },
                text: `Created ${createdDate}`
            })),
        h("p", {
            className: "pdf-item__meta",
            text: `${pdf.fontFamily === "lato" ? "Lato" : "DejaVu Sans Mono"} · ${pdf.fontSize} pt · ${pdf.orientation} · ${pdf.columns} column${pdf.columns === 1 ? "" : "s"}`
        }),
        h("div", { className: "pdf-item__actions" }, downloadButton))
    }

    function renderSelectedSongSummary(pdf) {
        const titles = pdf.selectedSongs
            .slice(0, 3)
            .map(song => displayValue(song.title, "Untitled song"))
        const moreCount = Math.max(0, pdf.selectedSongs.length - titles.length)
        const summary = titles.join(", ") +
            (moreCount > 0 ? ` and ${moreCount} more` : "")
        return summary === ""
            ? null
            : h("p", {
                className: "pdf-item__songs",
                text: summary
            })
    }

    async function handleDownloadClick(event) {
        const button = findActionTarget(event.target, list)
        if (
            button === null ||
            button.dataset.action !== "download-pdf" ||
            isDownloading
        ) {
            return
        }

        const pdf = pagedList.items().find(
            item => item.id === button.dataset.pdfId
        )
        if (pdf === undefined) {
            return
        }

        const sessionGeneration = ctx.session.state.generation
        setDownloading(true)
        try {
            const blob = await download(bookId, pdf.id, { signal: ctx.signal })
            if (!isRequestCurrent(sessionGeneration)) {
                return
            }
            await downloadPdf(blob, bookName, pdf)
        } catch (error) {
            if (
                !isRequestCurrent(sessionGeneration) ||
                error?.name === "AbortError"
            ) {
                return
            }
            if (
                error instanceof ApiError &&
                [401, 403, 404].includes(error.status)
            ) {
                await handleBookError(error)
                return
            }
            if (!(error instanceof ApiError)) {
                console.error(error)
            }
            ctx.status.show("error", getDownloadPdfErrorMessage(error))
        } finally {
            setDownloading(false)
            if (isRequestCurrent(sessionGeneration) && hasLostFocus()) {
                button.focus()
            }
        }
    }

    function setDownloading(value) {
        isDownloading = value
        for (const button of downloadButtons) {
            button.disabled = value
        }
    }

    function isRequestCurrent(sessionGeneration) {
        return ctx.isCurrent() &&
            ctx.session.state.generation === sessionGeneration
    }

    function bookScope() {
        return {
            type: "book",
            bookId,
            signal: ctx.signal,
            isCurrent: ctx.isCurrent
        }
    }

    function handleBookError(error) {
        return ctx.handleError(error, bookScope())
    }
}

function formatSelectedSongCount(count) {
    return `${count} selected song${count === 1 ? "" : "s"}`
}
