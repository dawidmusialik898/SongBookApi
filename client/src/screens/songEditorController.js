import { ApiError } from "../httpClient.js"
import {
    createSong,
    updateSong
} from "../songsApi.js"
import { getSongBook } from "../songBooksApi.js"
import {
    cloneEditorModel,
    createEmptyEditorModel,
    editorModelFingerprint,
    editorModelToPayload
} from "../songForm.js"
import { createSongEditorForm } from "../ui/songEditorForm.js"
import {
    getSaveSongErrorMessage,
    isUnavailableBookError
} from "../ui/errors.js"
import { normalizeAccessLevel } from "../ui/format.js"

const DRAFT_KEPT_MESSAGE = "Your account is not allowed to make this change. " +
    "Your song data was kept."

export function createSongEditorController(ctx, {
    mode,
    bookId,
    songId,
    key,
    ownerEmail,
    bookName,
    songPath,
    bookPath,
    serverModel,
    restoredModel
}) {
    let model = cloneEditorModel(restoredModel ?? serverModel)
    let draftRestored = restoredModel !== null
    let ignoreCleanup = false
    let saving = false
    let validationByKey = new Map()
    let formView
    const initialModel = editorModelFingerprint(serverModel)

    formView = createSongEditorForm(ctx, {
        mode,
        bookName,
        model,
        draftRestored,
        onFieldInput(name, value) {
            model.fields[name] = value
            clearValidation()
        },
        onPartInput(partKey, field, value) {
            const part = model.parts.find(candidate =>
                candidate.key === partKey
            )
            if (part === undefined) {
                return
            }
            if (field === "name") {
                part.name = value
            } else if (field === "notation") {
                part.notation = value
            }
            clearValidation()
        },
        onAddPart() {
            const part = createEmptyEditorModel().parts[0]
            model.parts.push(part)
            clearValidation()
            formView.renderParts(model, validationByKey, part.key)
        },
        onMovePart: movePart,
        onRemovePart: removePart,
        onCancel: cancel,
        onSubmit: save,
        onDiscard: discardDraft
    })

    return {
        cleanup,
        focusTarget: formView.titleInput,
        isDirty
    }

    function clearValidation() {
        validationByKey = new Map()
        formView.clearValidation(model)
        formView.setStatus("")
    }

    function showValidationErrors(errors) {
        validationByKey = new Map()
        for (const error of errors) {
            const values = validationByKey.get(error.partKey) ?? []
            values.push(error)
            validationByKey.set(error.partKey, values)
        }
        formView.showValidation(model, validationByKey)
        formView.setStatus("Fix the chord brackets marked below.")
        formView.focusError(errors[0]?.partKey)
    }

    function movePart(partKey, offset) {
        const index = model.parts.findIndex(part => part.key === partKey)
        const nextIndex = index + offset
        if (index < 0 || nextIndex < 0 || nextIndex >= model.parts.length) {
            return
        }
        const [part] = model.parts.splice(index, 1)
        model.parts.splice(nextIndex, 0, part)
        clearValidation()
        formView.renderParts(model, validationByKey, partKey)
    }

    function removePart(partKey) {
        const index = model.parts.findIndex(part => part.key === partKey)
        if (index < 0) {
            return
        }
        const [removed] = model.parts.splice(index, 1)
        const simplifiedKey = removed.id ?? removed.key
        model.simplified = model.simplified.filter(value =>
            value !== simplifiedKey
        )
        const focusPart = model.parts[Math.min(index, model.parts.length - 1)]
        clearValidation()
        formView.renderParts(model, validationByKey, focusPart?.key ?? null)
        if (focusPart === undefined) {
            formView.addPartButton.focus()
        }
    }

    async function cancel() {
        if (saving || !ctx.isCurrent()) {
            return
        }
        if (isDirty()) {
            const confirmed = await ctx.dialogs.confirmDialog({
                title: "Discard changes?",
                message: "Your unsaved changes will be lost.",
                confirmLabel: "Discard changes",
                cancelLabel: "Keep editing",
                destructive: true
            })
            if (!confirmed || !ctx.isCurrent()) {
                return
            }
        }

        ignoreCleanup = true
        deleteOwnedDraft()
        await ctx.goBackOr(mode === "edit" ? songPath : bookPath)
    }

    function discardDraft() {
        if (!ctx.isCurrent()) {
            return
        }
        deleteOwnedDraft()
        draftRestored = false
        model = cloneEditorModel(serverModel)
        validationByKey = new Map()
        formView.setStatus("")
        formView.update(model, false)
        formView.titleInput.focus()
    }

    async function save() {
        if (saving || !ctx.isCurrent()) {
            return
        }
        clearValidation()

        let conversion
        try {
            conversion = editorModelToPayload(model)
        } catch (error) {
            await ctx.handleError(error, "programmer")
            return
        }
        if (conversion.errors !== undefined) {
            showValidationErrors(conversion.errors)
            return
        }

        setBusy(true)
        try {
            if (mode === "create") {
                const created = await createSong(bookId, conversion.payload)
                if (!ctx.isCurrent()) {
                    return
                }
                if (
                    typeof created?.id !== "string" ||
                    created.id.trim() === ""
                ) {
                    throw new TypeError(
                        "The API returned an invalid created song."
                    )
                }
                ignoreCleanup = true
                deleteOwnedDraft()
                ctx.cache.bookList = null
                await ctx.navigate(
                    ctx.href("song", {
                        bookId,
                        songId: created.id
                    }),
                    {
                        replace: true,
                        status: "Song created."
                    }
                )
                return
            }

            await updateSong(bookId, songId, conversion.payload)
            if (!ctx.isCurrent()) {
                return
            }
            ignoreCleanup = true
            deleteOwnedDraft()
            ctx.cache.bookList = null
            await ctx.goBackOr(songPath, { status: "Song saved." })
        } catch (error) {
            if (!ctx.isCurrent() || error?.name === "AbortError") {
                return
            }
            await handleSaveError(error)
        } finally {
            if (ctx.isCurrent()) {
                setBusy(false)
            }
        }
    }

    function setBusy(value) {
        saving = value
        formView.setBusy(value)
    }

    async function handleSaveError(error) {
        if (!(error instanceof ApiError)) {
            await ctx.handleError(error, "programmer")
            return
        }
        if (error.status === 401) {
            await ctx.handleError(error, mutationScope())
            return
        }
        if (error.status === 403) {
            await refreshBookAfterForbidden()
            return
        }
        if (error.status === 404) {
            if (mode === "edit") {
                await showDeletedSongError()
            } else {
                discardForLostBook()
                await ctx.handleError(error, mutationScope())
            }
            return
        }
        formView.setStatus(getSaveSongErrorMessage(error, mode))
    }

    async function refreshBookAfterForbidden() {
        let latestBook
        try {
            latestBook = await getSongBook(bookId, { signal: ctx.signal })
        } catch (error) {
            if (!ctx.isCurrent() || error?.name === "AbortError") {
                return
            }
            if (error instanceof ApiError && error.status === 401) {
                await ctx.handleError(error, mutationScope())
                return
            }
            if (isUnavailableBookError(error)) {
                discardForLostBook()
            }
            await ctx.handleError(error, {
                type: "book",
                bookId,
                signal: ctx.signal,
                isCurrent: ctx.isCurrent
            })
            return
        }
        if (!ctx.isCurrent()) {
            return
        }
        if (latestBook === null || typeof latestBook !== "object") {
            await ctx.handleError(
                new TypeError("The API returned invalid song-book details."),
                "programmer"
            )
            return
        }
        const access = normalizeAccessLevel(latestBook.accessLevel)
        formView.setStatus(
            access === "admin" || access === "editor"
                ? "Your account is not allowed to make this change."
                : DRAFT_KEPT_MESSAGE
        )
    }

    async function showDeletedSongError() {
        try {
            await getSongBook(bookId, { signal: ctx.signal })
        } catch (error) {
            if (!ctx.isCurrent() || error?.name === "AbortError") {
                return
            }
            if (error instanceof ApiError && error.status === 401) {
                await ctx.handleError(error, mutationScope())
                return
            }
            if (isUnavailableBookError(error)) {
                discardForLostBook()
            }
            await ctx.handleError(error, {
                type: "book",
                bookId,
                signal: ctx.signal,
                isCurrent: ctx.isCurrent
            })
            return
        }
        if (ctx.isCurrent()) {
            formView.setStatus(
                "This song was deleted by someone else. " +
                "Copy anything you need, then cancel."
            )
        }
    }

    function discardForLostBook() {
        ignoreCleanup = true
        deleteOwnedDraft()
    }

    function mutationScope() {
        return {
            type: "mutation",
            bookId,
            signal: ctx.signal,
            path: ctx.router.current?.path,
            isCurrent: ctx.isCurrent
        }
    }

    function deleteOwnedDraft() {
        if (
            ownerEmail !== null &&
            ctx.drafts.owner === ownerEmail
        ) {
            ctx.drafts.delete(key)
        }
    }

    function isDirty() {
        return !ignoreCleanup && (
            draftRestored ||
            editorModelFingerprint(model) !== initialModel
        )
    }

    function cleanup() {
        if (ignoreCleanup || !isDirty()) {
            return null
        }
        if (ctx.session.shouldDiscardDrafts()) {
            deleteOwnedDraft()
            return null
        }

        const ending = ctx.session.isEnding()
        const sameOwner = ownerEmail !== null &&
            ctx.session.state.status === "authenticated" &&
            normalizeEmail(ctx.session.state.email) === ownerEmail
        if (!ending && !sameOwner) {
            return null
        }
        if (ownerEmail === null) {
            return null
        }

        ctx.drafts.set(ownerEmail, key, {
            mode,
            bookId,
            songId,
            title: currentSongTitle(),
            fields: { ...model.fields },
            parts: model.parts.map(part => ({
                key: part.key,
                id: part.id,
                name: part.name,
                notation: part.notation
            }))
        })
        return {
            type: "info",
            message: `Unsaved changes to "${currentSongTitle()}" were kept.`,
            action: {
                text: "Continue editing",
                href: ctx.href(
                    mode === "edit" ? "song-edit" : "song-new",
                    mode === "edit"
                        ? { bookId, songId }
                        : { bookId }
                )
            },
            draftKept: true
        }
    }

    function currentSongTitle() {
        const title = String(model.fields.title ?? "").trim()
        return title === "" ? "Untitled song" : title
    }
}

function normalizeEmail(value) {
    return typeof value === "string" && value.trim() !== ""
        ? value.trim().toLowerCase()
        : null
}
