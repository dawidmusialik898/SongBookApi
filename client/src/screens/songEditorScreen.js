import { ApiError } from "../httpClient.js"
import { createDraftKey } from "../drafts.js"
import { getSong } from "../songsApi.js"
import { getSongBook } from "../songBooksApi.js"
import {
    createEmptyEditorModel,
    songToEditorModel
} from "../songForm.js"
import { createSongEditorController } from "./songEditorController.js"
import { h } from "../ui/dom.js"
import { displayValue, normalizeAccessLevel } from "../ui/format.js"
import { isUnavailableBookError } from "../ui/errors.js"

export async function renderSongEditorScreen(ctx) {
    const bookId = ctx.params.bookId
    const mode = ctx.route.name === "song-new" ? "create" : "edit"
    const songId = mode === "edit" ? ctx.params.songId : null
    const key = createDraftKey(bookId, songId)
    const ownerEmail = normalizeEmail(ctx.session.state.email)
    const bookPath = ctx.href("book", { bookId })
    const songPath = mode === "edit"
        ? ctx.href("song", { bookId, songId })
        : null
    const heading = h("h1", {
        id: "screen-heading",
        attrs: { tabindex: "-1" },
        text: "Loading…"
    })
    ctx.root.replaceChildren(heading)

    const bookRequest = getSongBook(bookId, { signal: ctx.signal })
        .then(value => ({ value }), error => ({ error }))
    const songRequest = mode === "edit"
        ? getSong(bookId, songId, { signal: ctx.signal })
            .then(value => ({ value }), error => ({ error }))
        : Promise.resolve({ value: null })
    const [bookResult, songResult] = await Promise.all([
        bookRequest,
        songRequest
    ])
    if (!ctx.isCurrent()) {
        return {}
    }

    const storedDraft = ownerEmail !== null &&
        ctx.drafts.owner === ownerEmail
        ? ctx.drafts.get(key)
        : null
    function deleteStoredDraft() {
        if (storedDraft !== null && ownerEmail !== null) {
            ctx.drafts.delete(key)
        }
    }

    if (bookResult.error !== undefined) {
        heading.textContent = mode === "create" ? "New song" : "Edit song"
        if (isUnavailableBookError(bookResult.error)) {
            deleteStoredDraft()
        }
        await ctx.handleError(bookResult.error, {
            type: "book",
            bookId,
            signal: ctx.signal,
            isCurrent: ctx.isCurrent
        })
        return { focusTarget: heading }
    }
    if (songResult.error !== undefined) {
        heading.textContent = "Edit song"
        if (
            songResult.error instanceof ApiError &&
            songResult.error.status === 404
        ) {
            deleteStoredDraft()
        }
        await ctx.handleError(songResult.error, {
            type: "song",
            bookId,
            songId,
            signal: ctx.signal,
            isCurrent: ctx.isCurrent
        })
        return { focusTarget: heading }
    }

    const book = bookResult.value
    if (book === null || typeof book !== "object") {
        await ctx.handleError(
            new TypeError("The API returned invalid song-book details."),
            "programmer"
        )
        return { focusTarget: heading }
    }
    const access = normalizeAccessLevel(book.accessLevel)
    if (access !== "admin" && access !== "editor") {
        deleteStoredDraft()
        await ctx.navigate(mode === "edit" ? songPath : bookPath, {
            replace: true,
            status: {
                type: "error",
                message: "You need Editor access to change songs in this book."
            }
        })
        return { focusTarget: heading }
    }

    const song = songResult.value
    if (
        mode === "edit" &&
        (
            song === null ||
            typeof song !== "object" ||
            !Array.isArray(song.parts)
        )
    ) {
        await ctx.handleError(
            new TypeError("The API returned invalid song details."),
            "programmer"
        )
        return { focusTarget: heading }
    }

    const bookName = displayValue(book.name, "Untitled song book")
    const songName = mode === "edit"
        ? displayValue(song.title, "Untitled song")
        : null
    const serverModel = mode === "create"
        ? createEmptyEditorModel()
        : songToEditorModel(song)
    const restoredModel = storedDraft === null
        ? null
        : readDraftModel(storedDraft, {
            mode,
            bookId,
            songId,
            serverModel
        })
    if (storedDraft !== null && restoredModel === null) {
        deleteStoredDraft()
    }
    if (restoredModel !== null) {
        ctx.auth.draftRestored = true
    }

    const screenTitle = mode === "create"
        ? "New song"
        : `Edit ${songName}`
    ctx.setTitle([screenTitle, bookName])
    ctx.setBreadcrumb([
        { text: bookName, href: bookPath },
        { text: screenTitle }
    ])

    return createSongEditorController(ctx, {
        mode,
        bookId,
        songId,
        key,
        ownerEmail,
        bookName,
        songPath,
        bookPath,
        serverModel,
        restoredModel,
        serverRevision: song?.revision ?? 0
    })
}

function readDraftModel(draft, {
    mode,
    bookId,
    songId,
    serverModel
}) {
    if (
        draft === null ||
        typeof draft !== "object" ||
        draft.mode !== mode ||
        draft.bookId !== bookId ||
        draft.songId !== songId ||
        typeof draft.title !== "string" ||
        draft.fields === null ||
        typeof draft.fields !== "object" ||
        !Array.isArray(draft.parts)
    ) {
        return null
    }

    const fields = { ...serverModel.fields }
    for (const name of Object.keys(fields)) {
        if (typeof draft.fields[name] !== "string") {
            return null
        }
        fields[name] = draft.fields[name]
    }
    const parts = draft.parts.map(part => {
        if (
            part === null ||
            typeof part !== "object" ||
            typeof part.key !== "string" ||
            part.key.trim() === "" ||
            (part.id !== null && typeof part.id !== "string") ||
            typeof part.name !== "string" ||
            typeof part.notation !== "string"
        ) {
            return null
        }
        return {
            key: part.key,
            id: part.id ?? null,
            name: part.name,
            notation: part.notation
        }
    })
    if (parts.some(part => part === null)) {
        return null
    }

    return {
        fields,
        parts,
        simplified: [...serverModel.simplified],
        expectedRevision: Number.isSafeInteger(draft.expectedRevision)
            ? draft.expectedRevision : undefined
    }
}

function normalizeEmail(value) {
    return typeof value === "string" && value.trim() !== ""
        ? value.trim().toLowerCase()
        : null
}
