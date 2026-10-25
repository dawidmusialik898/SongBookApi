import { h, later } from "./dom.js"

const AUTO_HIDE_DELAY = 5000
const STATUS_TYPES = new Set(["info", "success", "error"])

export function createStatus(element) {
    let timer = null

    function clear() {
        if (timer !== null) {
            clearTimeout(timer)
            timer = null
        }
        element.replaceChildren()
        element.className = "status"
        element.setAttribute("role", "status")
        element.setAttribute("aria-live", "polite")
        element.setAttribute("aria-atomic", "true")
    }

    function dismiss() {
        const document = element.ownerDocument
        const hadFocus = element.contains(document.activeElement)
        clear()
        if (hadFocus) {
            document.getElementById("screen-heading")?.focus()
        }
    }

    function show(type, message, { action = null } = {}) {
        if (!STATUS_TYPES.has(type)) {
            throw new TypeError(`Unsupported status type: ${type}`)
        }

        clear()
        element.className = `status status--${type}`
        element.setAttribute(
            "role",
            type === "error" ? "alert" : "status"
        )
        element.setAttribute(
            "aria-live",
            type === "error" ? "assertive" : "polite"
        )

        const children = [h("p", {
            id: "app-status-message",
            className: "status__message",
            text: String(message)
        })]

        if (action !== null) {
            children.push(h("a", {
                id: "app-status-action",
                className: "status__action",
                attrs: { href: action.href },
                text: action.text
            }))
        }

        if (type === "error") {
            children.push(h("button", {
                id: "app-status-dismiss",
                className: "button button--neutral status__dismiss",
                type: "button",
                text: "Dismiss",
                on: { click: dismiss }
            }))
        }

        element.replaceChildren(...children)
        if (type !== "error") {
            timer = later(clear, AUTO_HIDE_DELAY)
        }
    }

    return { show, clear }
}
