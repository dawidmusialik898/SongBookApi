import { h, isInDocument } from "./dom.js"

export function createDialogs(dialog) {
    let active = null
    const document = dialog.ownerDocument

    dialog.addEventListener("cancel", event => {
        if (active === null) {
            return
        }
        event.preventDefault()
        dialog.close("cancel")
    })
    dialog.addEventListener("close", () => {
        if (active === null) {
            return
        }

        const current = active
        active = null
        dialog.setAttribute("aria-busy", "false")
        const confirmed = dialog.returnValue === "confirm"
        current.resolve(
            current.mode === "confirm"
                ? confirmed
                : confirmed
                    ? current.value
                    : null
        )

        const focusTarget = isInDocument(current.opener)
            ? current.opener
            : document.getElementById("screen-heading")
        focusTarget?.focus()
    })

    function confirmDialog({
        title,
        message,
        confirmLabel,
        cancelLabel = "Cancel",
        destructive = false
    }) {
        const current = openDialog({
            mode: "confirm",
            title,
            message,
            confirmLabel,
            cancelLabel,
            destructive
        })
        return current.promise
    }

    function promptDialog({
        title,
        label,
        value = "",
        maxLength,
        required = true,
        confirmLabel,
        submit
    }) {
        if (typeof submit !== "function") {
            throw new TypeError("A prompt submit callback is required.")
        }

        const current = openDialog({
            mode: "prompt",
            title,
            message: "",
            label,
            value,
            maxLength,
            required,
            confirmLabel,
            cancelLabel: "Cancel",
            submit
        })
        return current.promise
    }

    function openDialog(options) {
        if (active !== null || dialog.open) {
            throw new Error("Only one dialog can be open.")
        }

        const opener = document.activeElement
        const form = h("form", {
            id: "dialog-form",
            attrs: { method: "dialog" }
        })
        const heading = h("h2", {
            id: "dialog-title",
            text: options.title
        })
        const message = h("p", {
            id: "dialog-message",
            text: options.message ?? ""
        })
        const error = h("p", {
            id: "dialog-error",
            attrs: { role: "alert" },
            hidden: true
        })
        const controls = []
        let input = null

        form.appendChild(heading)
        form.appendChild(message)
        if (options.mode === "prompt") {
            input = h("input", {
                id: "dialog-input",
                attrs: {
                    ...(options.maxLength === undefined
                        ? {}
                        : { maxlength: options.maxLength }),
                    ...(options.required ? { required: "" } : {}),
                    type: "text"
                }
            })
            input.value = String(options.value)
            const label = h("label", {
                attrs: { for: "dialog-input" },
                text: options.label
            })
            form.appendChild(label)
            form.appendChild(input)
        }
        form.appendChild(error)

        const cancelButton = h("button", {
            id: "dialog-cancel",
            className: "button button--neutral",
            type: "button",
            text: options.cancelLabel
        })
        const confirmButton = h("button", {
            id: "dialog-confirm",
            className: options.destructive
                ? "button button--destructive"
                : "button button--primary",
            type: "submit",
            text: options.confirmLabel
        })
        const actions = h("div", {
            className: "dialog__actions"
        }, cancelButton, confirmButton)
        form.appendChild(actions)

        const promise = new Promise(resolve => {
            active = {
                mode: options.mode,
                opener,
                resolve,
                submit: options.submit,
                value: null,
                input,
                error,
                controls: [...(input === null ? [] : [input]),
                    cancelButton, confirmButton]
            }
        })

        cancelButton.addEventListener("click", () => {
            dialog.close("cancel")
        })
        form.addEventListener("submit", async event => {
            event.preventDefault()
            const current = active
            if (current === null) {
                return
            }

            if (current.mode === "confirm") {
                dialog.close("confirm")
                return
            }

            const value = current.input.value.trim()
            if (options.required && value === "") {
                showError(current, "Enter a value.")
                current.input.focus()
                return
            }
            if (
                options.maxLength !== undefined &&
                value.length > options.maxLength
            ) {
                showError(
                    current,
                    `Use ${options.maxLength} characters or fewer.`
                )
                current.input.focus()
                return
            }

            setBusy(current, true)
            try {
                const errorMessage = await current.submit(value)
                if (active !== current) {
                    return
                }
                if (errorMessage !== null) {
                    if (typeof errorMessage !== "string") {
                        throw new TypeError(
                            "A prompt submit callback must return a message or null."
                        )
                    }
                    showError(current, errorMessage)
                    return
                }

                current.value = value
                dialog.close("confirm")
            } finally {
                if (active === current) {
                    setBusy(current, false)
                }
            }
        })

        dialog.replaceChildren(form)
        dialog.setAttribute("aria-busy", "false")
        dialog.showModal()
        if (input !== null) {
            input.focus()
            input.select()
        } else if (options.destructive) {
            cancelButton.focus()
        } else {
            confirmButton.focus()
        }

        return { promise }
    }

    function showError(current, message) {
        current.error.hidden = false
        current.error.textContent = message
    }

    function setBusy(current, busy) {
        for (const control of current.controls) {
            control.disabled = busy
        }
        dialog.setAttribute("aria-busy", String(busy))
    }

    function close() {
        if (active === null) {
            return false
        }
        dialog.close("cancel")
        return true
    }

    return { confirmDialog, promptDialog, close }
}
