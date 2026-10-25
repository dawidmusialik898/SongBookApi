import { h, hasLostFocus } from "./dom.js"

export function createViewLinks(ctx, rerender, isPending) {
    const links = []
    const options = ctx.auth.view === "login"
        ? [
            ["forgot-password", "Forgot password?"],
            ["resend-confirmation", "Resend confirmation email"],
            ["register", "New here? Create an account"]
        ]
        : ctx.auth.view === "register"
            ? [["login", "Already have an account? Sign in"]]
            : [["login", "Back to sign in"]]

    for (const [view, text] of options) {
        links.push(h("button", {
            className: "button button--link",
            type: "button",
            dataset: { authView: view },
            text,
            on: {
                click: () => {
                    if (isPending()) {
                        return
                    }
                    if (
                        ctx.auth.view === "reset-password" &&
                        view === "login"
                    ) {
                        ctx.auth.resetCredentials = null
                    }
                    ctx.auth.view = view
                    rerender({ focus: true })
                }
            }
        }))
    }
    return h("nav", {
        className: "auth-links",
        attrs: { "aria-label": "Account options" }
    }, links)
}

export async function submitForm(ctx, form, event, action, isPending, setPending) {
    event.preventDefault()
    if (isPending()) {
        return false
    }

    const invalidControl = findInvalidControl(form)
    if (invalidControl !== null) {
        invalidControl.reportValidity?.()
        invalidControl.focus()
        return false
    }

    const requestGeneration = ctx.session.state.generation
    const isCurrent = () => ctx.isCurrent() &&
        ctx.session.state.generation === requestGeneration
    if (!isCurrent()) {
        return false
    }

    const focusBefore = document.activeElement
    setPending(true)
    setFormBusy(form, true)
    let focusTarget = null
    try {
        // Disabled controls lose and cannot take focus until re-enabled.
        await action(isCurrent, control => {
            focusTarget = control
        })
        return true
    } finally {
        if (isCurrent()) {
            setPending(false)
            setFormBusy(form, false)
            if (focusTarget !== null) {
                focusTarget.focus()
            } else if (hasLostFocus()) {
                (form.contains(focusBefore)
                    ? focusBefore
                    : firstVisibleInput(form))?.focus()
            }
        }
    }
}

export function addField(form, {
    id,
    label,
    name,
    type,
    autocomplete,
    required = false,
    minLength = undefined,
    readonly = false
}) {
    const input = h("input", {
        id,
        type,
        attrs: {
            name,
            autocomplete,
            ...(required ? { required: "" } : {}),
            ...(minLength === undefined
                ? {}
                : { minlength: minLength }),
            ...(readonly ? { readonly: "" } : {})
        }
    })
    form.appendChild(h("div", {
        className: "form-field"
    },
    h("label", {
        attrs: { for: id },
        text: label
    }),
    input))
    return input
}

export function appendSubmit(form, text) {
    form.appendChild(h("button", {
        className: "button button--primary",
        type: "submit",
        text
    }))
}

function findInvalidControl(form) {
    if (!form.checkValidity()) {
        for (const control of form.elements) {
            if (!control.checkValidity()) {
                return control
            }
        }
        return form
    }

    for (const control of form.elements) {
        if (
            control.getAttribute("required") !== null &&
            control.type !== "hidden" &&
            control.value.trim() === ""
        ) {
            return control
        }
        const minimum = Number(control.getAttribute("minlength"))
        if (
            Number.isInteger(minimum) &&
            minimum > 0 &&
            control.value.length < minimum
        ) {
            return control
        }
        if (
            control.type === "email" &&
            control.value !== "" &&
            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(control.value)
        ) {
            return control
        }
    }
    return null
}

export function firstVisibleInput(form) {
    for (const control of form.elements) {
        if (control.tagName === "INPUT" && control.type !== "hidden") {
            return control
        }
    }
    return null
}

export function setFormBusy(form, busy) {
    form.setAttribute("aria-busy", String(busy))
    for (const control of form.elements) {
        control.disabled = busy
    }
}
