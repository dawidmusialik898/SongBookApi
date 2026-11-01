import { getShareLink, replaceShareLink, revokeShareLink } from "../shareLinksApi.js"
import { h } from "./dom.js"

export function createShareLinkControls(ctx, bookId, onError) {
    let enabled = false
    let busy = false
    const state = h("p", { id: "share-link-state", text: "Loading reader link…" })
    const field = h("input", {
        id: "share-link-url", type: "text", hidden: true,
        attrs: { readonly: "", autocomplete: "off", "aria-label": "Reader link" }
    })
    const create = h("button", {
        id: "enable-share-link", type: "button", className: "button button--neutral",
        disabled: true, text: "Enable reader link", on: { click: () => mutate(false) }
    })
    const revoke = h("button", {
        id: "revoke-share-link", type: "button", className: "button button--neutral",
        hidden: true, text: "Revoke reader link", on: { click: () => mutate(true) }
    })
    const copy = h("button", {
        id: "copy-share-link", type: "button", className: "button button--neutral",
        hidden: true, text: "Copy link", on: { click: copyLink }
    })
    const root = h("section", { id: "reader-link-controls", hidden: true },
        h("h2", { text: "Anonymous reader link" }),
        h("p", {
            text: "Anyone with this link can read this song book and download its saved PDFs. They cannot edit it. Revoke the link to stop future access."
        }),
        h("p", {
            text: "The link has no expiry. Downloaded files and already-read content cannot be recalled. Copy this link now; replace it to get a new link later. Replacement invalidates the previous link."
        }),
        state, field, create, revoke, copy)

    async function load() {
        root.hidden = false
        try {
            const metadata = await getShareLink(bookId, { signal: ctx.signal })
            if (!ctx.isCurrent()) return
            enabled = metadata.enabled === true
            update()
        } catch (error) {
            if (!ctx.isCurrent() || error?.name === "AbortError") return
            state.textContent = "Reader link settings could not be loaded."
            await onError(error)
        }
    }

    async function mutate(revoking) {
        if (!ctx.isCurrent() || busy) return
        if (enabled) {
            const confirmed = await ctx.dialogs.confirmDialog({
                title: revoking ? "Revoke reader link?" : "Replace reader link?",
                message: "The previous link will stop working immediately for future requests.",
                confirmLabel: revoking ? "Revoke" : "Replace",
                destructive: true
            })
            if (!confirmed || !ctx.isCurrent() || busy) return
        }
        const generation = ctx.session.state.generation
        busy = true
        update()
        try {
            if (revoking) {
                await revokeShareLink(bookId, { signal: ctx.signal })
            } else {
                const result = await replaceShareLink(bookId, { signal: ctx.signal })
                if (!current(generation)) return
                field.value = `${window.location.origin}/` +
                    ctx.href("shared-book", { bookId, token: result.token })
            }
            if (!current(generation)) return
            enabled = !revoking
            if (revoking) field.value = ""
            field.hidden = revoking
            copy.hidden = revoking
            ctx.status.show("success", revoking ? "Reader link revoked." : "Copy this link now; it is shown only once.")
        } catch (error) {
            if (current(generation) && error?.name !== "AbortError") await onError(error)
        } finally {
            if (current(generation)) {
                busy = false
                update()
            }
        }
    }

    async function copyLink() {
        if (!ctx.isCurrent() || busy || field.value === "") return
        const generation = ctx.session.state.generation
        try {
            if (typeof navigator?.clipboard?.writeText !== "function") throw new Error("Clipboard unavailable")
            await navigator.clipboard.writeText(field.value)
            if (current(generation)) ctx.status.show("success", "Reader link copied.")
        } catch {
            if (!current(generation)) return
            field.focus()
            field.select()
            ctx.status.show("info", "Link selected. Copy it using your browser or keyboard.")
        }
    }

    function current(generation) {
        return ctx.isCurrent() && ctx.session.state.generation === generation
    }
    function update() {
        state.textContent = enabled ? "Reader link enabled. The existing secret cannot be retrieved." : "Reader link disabled."
        create.textContent = enabled ? "Replace reader link" : "Enable reader link"
        create.disabled = busy
        revoke.disabled = busy
        copy.disabled = busy
        revoke.hidden = !enabled
    }
    return { root, load, cleanup() { field.value = ""; field.hidden = true; copy.hidden = true } }
}
