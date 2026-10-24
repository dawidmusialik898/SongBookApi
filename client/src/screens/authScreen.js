import {
    login,
    registerAccount,
    requestPasswordReset,
    resendConfirmation,
    resetPassword
} from "../authApi.js"
import { resetAntiforgeryToken } from "../httpClient.js"
import {
    getAuthValidationMessage
} from "../ui/errors.js"
import { h } from "../ui/dom.js"

const VIEW_TITLES = {
    login: "Sign in",
    register: "Create account",
    "forgot-password": "Forgot password",
    "resend-confirmation": "Resend confirmation",
    "reset-password": "Reset password"
}

export function handleAuthQuery(ctx) {
    const currentUrl = new URL(window.location.href)
    const authResult = currentUrl.searchParams.get("auth")
    let notice = null

    if (authResult === "confirmed") {
        notice = {
            type: "success",
            message: "Email confirmed. You can now sign in."
        }
    } else if (authResult === "confirmation-failed") {
        notice = {
            type: "error",
            message: "The confirmation link is invalid or expired."
        }
    } else if (authResult === "reset-password") {
        const email = currentUrl.searchParams.get("email")
        const code = currentUrl.searchParams.get("code")
        if (
            typeof email === "string" &&
            email !== "" &&
            typeof code === "string" &&
            code !== ""
        ) {
            ctx.auth.resetCredentials = { email, code }
            ctx.auth.emailPrefill = email
            ctx.auth.view = "reset-password"
            ctx.auth.forceAuth = true
        } else {
            notice = {
                type: "error",
                message: "The password reset link is invalid or incomplete."
            }
        }
    }

    if (authResult !== null) {
        currentUrl.searchParams.delete("auth")
        currentUrl.searchParams.delete("email")
        currentUrl.searchParams.delete("code")
        const search = currentUrl.searchParams.toString()
        const sanitizedUrl = currentUrl.pathname +
            (search === "" ? "" : `?${search}`) +
            currentUrl.hash
        window.history.replaceState(
            window.history.state,
            "",
            sanitizedUrl
        )
    }

    ctx.pendingStatus = notice
}

export function renderAuthScreen(ctx) {
    ctx.setBreadcrumb([])
    let pending = false
    const heading = h("h1", {
        id: "screen-heading",
        attrs: { tabindex: "-1" }
    })
    const card = h("section", { className: "auth-card" })
    let activeForm = null

    function renderView({ focus = false, focusId = null } = {}) {
        const view = VIEW_TITLES[ctx.auth.view]
            ? ctx.auth.view
            : "login"
        ctx.auth.view = view
        heading.textContent = VIEW_TITLES[view]
        ctx.setTitle([VIEW_TITLES[view]])
        const form = createForm(
            ctx,
            view,
            renderView,
            () => pending,
            value => {
                pending = value
            }
        )
        activeForm = form
        card.replaceChildren(
            heading,
            form,
            createViewLinks(ctx, renderView, () => pending)
        )
        ctx.root.replaceChildren(card)
        if (focus) {
            (focusId === null
                ? firstVisibleInput(form)
                : document.getElementById(focusId))?.focus()
        }
    }

    renderView()
    return {
        focusTarget: heading,
        onKeydown() {},
        get form() {
            return activeForm
        }
    }
}

function createForm(ctx, view, rerender, isPending, setPending) {
    const form = h("form", {
        id: `${view}-form`,
        className: "auth-form"
    })

    if (view === "login") {
        const email = addField(form, {
            id: "login-email",
            label: "Email",
            name: "email",
            type: "email",
            autocomplete: "username",
            required: true
        })
        email.value = ctx.auth.emailPrefill
        const password = addField(form, {
            id: "login-password",
            label: "Password",
            name: "password",
            type: "password",
            autocomplete: "current-password",
            required: true
        })
        const remember = h("input", {
            id: "login-remember-me",
            type: "checkbox",
            attrs: { name: "rememberMe" }
        })
        form.appendChild(h("div", {
            className: "checkbox-field"
        },
        remember,
        h("label", {
            attrs: { for: "login-remember-me" },
            text: "Keep me signed in"
        })))
        appendSubmit(form, "Sign in")
        form.addEventListener("submit", event =>
            submitForm(ctx, form, event, async isCurrent => {
                try {
                    await login({
                        email: email.value,
                        password: password.value,
                        rememberMe: remember.checked === true
                    })
                } catch {
                    if (isCurrent()) {
                        ctx.status.show(
                            "error",
                            "Sign-in failed. Check your credentials or use " +
                                "the confirmation and password recovery options."
                        )
                        password.focus()
                    }
                    return
                }

                if (!isCurrent()) {
                    return
                }
                setFormBusy(form, false)
                setPending(false)
                resetAntiforgeryToken()
                ctx.auth.forceAuth = false
                ctx.auth.resetCredentials = null
                const previousView = ctx.router.current?.view
                const loadedState = await ctx.session.load()
                const loadedGeneration = loadedState.generation
                if (
                    ctx.router.current?.view !== previousView ||
                    ctx.session.state.generation !== loadedGeneration
                ) {
                    return
                }
                if (ctx.session.state.status !== "authenticated") {
                    await ctx.router.render({ focus: true })
                    ctx.status.show(
                        "error",
                        "The session could not be verified. Please sign in again."
                    )
                    return
                }

                ctx.auth.emailPrefill = ""
                await ctx.router.render({ focus: true })
                if (ctx.session.state.generation === loadedGeneration) {
                    ctx.status.show("success", "Signed in.")
                }
            }, isPending, setPending)
        )
        return form
    }

    if (view === "register") {
        const email = addField(form, {
            id: "register-email",
            label: "Email",
            name: "email",
            type: "email",
            autocomplete: "username",
            required: true
        })
        const password = addField(form, {
            id: "register-password",
            label: "Password",
            name: "password",
            type: "password",
            autocomplete: "new-password",
            minLength: 12,
            required: true
        })
        const confirmation = addField(form, {
            id: "register-confirm-password",
            label: "Confirm password",
            name: "confirmPassword",
            type: "password",
            autocomplete: "new-password",
            minLength: 12,
            required: true
        })
        appendSubmit(form, "Create account")
        form.addEventListener("submit", event =>
            submitForm(ctx, form, event, async isCurrent => {
                if (password.value !== confirmation.value) {
                    ctx.status.show("error", "The passwords do not match.")
                    confirmation.focus()
                    return
                }
                try {
                    await registerAccount({
                        email: email.value,
                        password: password.value
                    })
                } catch (error) {
                    if (isCurrent()) {
                        ctx.status.show(
                            "error",
                            getAuthValidationMessage(
                                error,
                                "Registration could not be completed."
                            )
                        )
                    }
                    return
                }
                if (!isCurrent()) {
                    return
                }

                password.value = ""
                confirmation.value = ""
                ctx.auth.emailPrefill = email.value
                ctx.auth.view = "login"
                rerender({ focus: true, focusId: "login-email" })
                ctx.status.show(
                    "success",
                    "Registration received. Use the confirmation link " +
                        "sent by email before signing in."
                )
            }, isPending, setPending)
        )
        return form
    }

    if (view === "forgot-password" || view === "resend-confirmation") {
        const isForgot = view === "forgot-password"
        const id = isForgot
            ? "forgot-password-email"
            : "resend-confirmation-email"
        const email = addField(form, {
            id,
            label: "Email",
            name: "email",
            type: "email",
            autocomplete: "username",
            required: true
        })
        email.value = ctx.auth.emailPrefill
        appendSubmit(
            form,
            isForgot ? "Send reset email" : "Send confirmation email"
        )
        form.addEventListener("submit", event =>
            submitForm(ctx, form, event, async isCurrent => {
                try {
                    if (isForgot) {
                        await requestPasswordReset(email.value)
                    } else {
                        await resendConfirmation(email.value)
                    }
                } catch {
                    if (isCurrent()) {
                        ctx.status.show(
                            "error",
                            "The request could not be completed. Try again later."
                        )
                    }
                    return
                }
                if (isCurrent()) {
                    ctx.status.show(
                        "success",
                        "If the account is eligible, an email was sent."
                    )
                }
            }, isPending, setPending)
        )
        return form
    }

    const email = addField(form, {
        id: "reset-password-email",
        label: "Email",
        name: "email",
        type: "email",
        autocomplete: "username",
        required: true,
        readonly: true
    })
    email.value = ctx.auth.resetCredentials?.email ?? ""
    const code = h("input", {
        id: "reset-password-code",
        type: "hidden",
        attrs: { name: "code" }
    })
    code.value = ctx.auth.resetCredentials?.code ?? ""
    form.appendChild(code)
    const password = addField(form, {
        id: "reset-password-new-password",
        label: "New password",
        name: "newPassword",
        type: "password",
        autocomplete: "new-password",
        minLength: 12,
        required: true
    })
    const confirmation = addField(form, {
        id: "reset-password-confirm-password",
        label: "Confirm new password",
        name: "confirmPassword",
        type: "password",
        autocomplete: "new-password",
        minLength: 12,
        required: true
    })
    appendSubmit(form, "Reset password")
    form.addEventListener("submit", event =>
        submitForm(ctx, form, event, async isCurrent => {
            if (ctx.auth.resetCredentials === null) {
                ctx.status.show(
                    "error",
                    "The password reset link is invalid or incomplete."
                )
                return
            }
            if (password.value !== confirmation.value) {
                ctx.status.show("error", "The passwords do not match.")
                confirmation.focus()
                return
            }

            const resetEmail = ctx.auth.resetCredentials.email
            try {
                await resetPassword({
                    email: resetEmail,
                    code: ctx.auth.resetCredentials.code,
                    newPassword: password.value
                })
            } catch (error) {
                if (isCurrent()) {
                    ctx.status.show(
                        "error",
                        getAuthValidationMessage(
                            error,
                            "The reset link is invalid or expired, or the " +
                                "new password is not accepted."
                        )
                    )
                }
                return
            }
            if (!isCurrent()) {
                return
            }

            ctx.auth.resetCredentials = null
            ctx.auth.emailPrefill = resetEmail
            ctx.auth.forceAuth = true
            ctx.auth.view = "login"
            rerender({ focus: true, focusId: "login-password" })
            ctx.status.show(
                "success",
                "Password reset. Sign in with the new password."
            )
        }, isPending, setPending)
    )
    return form
}

function createViewLinks(ctx, rerender, isPending) {
    const links = []
    const options = ctx.auth.view === "login"
        ? [
            ["forgot-password", "Forgot password?"],
            ["resend-confirmation", "Resend confirmation email"],
            ["register", "New here? Create an account"]
        ]
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

async function submitForm(ctx, form, event, action, isPending, setPending) {
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

    setPending(true)
    setFormBusy(form, true)
    try {
        await action(isCurrent)
        return true
    } finally {
        if (isCurrent()) {
            setPending(false)
            setFormBusy(form, false)
        }
    }
}

function addField(form, {
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

function appendSubmit(form, text) {
    form.appendChild(h("button", {
        className: "button button--primary",
        type: "submit",
        text
    }))
}

function findInvalidControl(form) {
    if (!form.checkValidity()) {
        const invalid = form.elements.find(control =>
            control.valid === false
        )
        return invalid ?? form
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

function firstVisibleInput(form) {
    return form.elements.find(control =>
        control.tagName === "INPUT" && control.type !== "hidden"
    )
}

function setFormBusy(form, busy) {
    form.setAttribute("aria-busy", String(busy))
    for (const control of form.elements) {
        control.disabled = busy
    }
}
