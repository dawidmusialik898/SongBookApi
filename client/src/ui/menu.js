import { h } from "./dom.js"

export function createMenu({
    label,
    accessibleName,
    items,
    id,
    buttonId = undefined
}) {
    if (typeof id !== "string" || id.trim() === "") {
        throw new TypeError("A menu panel id is required.")
    }

    const root = h("div", { className: "menu" })
    const button = h("button", {
        id: buttonId,
        className: "button button--neutral menu__button",
        type: "button",
        text: label,
        attrs: {
            "aria-controls": id,
            "aria-expanded": "false",
            "aria-label": accessibleName
        }
    })
    const panel = h("div", {
        id,
        className: "menu__panel",
        hidden: true
    })
    const actions = []

    for (const item of items) {
        if (item.kind === "link") {
            const link = h("a", {
                id: item.id,
                className: item.destructive
                    ? "menu__item menu__item--destructive"
                    : "menu__item",
                attrs: {
                    href: item.href,
                    ...(item.action === undefined
                        ? {}
                        : { "data-action": item.action })
                },
                text: item.text,
                on: {
                    click: () => close()
                }
            })
            panel.appendChild(link)
            actions.push(link)
            continue
        }

        if (item.kind !== "button") {
            throw new TypeError("A menu item must be a link or button.")
        }

        const actionButton = h("button", {
            id: item.id,
            className: item.destructive
                ? "menu__item menu__item--destructive"
                : "menu__item",
            type: "button",
            attrs: item.action === undefined
                ? {}
                : { "data-action": item.action },
            text: item.text,
            on: {
                click: async event => {
                    // A dialog opened by the action must see a visible opener.
                    close({ focus: true })
                    await item.onSelect?.(event)
                }
            }
        })
        panel.appendChild(actionButton)
        actions.push(actionButton)
    }

    function isOpen() {
        return !panel.hidden
    }

    function close({ focus = false } = {}) {
        if (!isOpen()) {
            return false
        }
        panel.hidden = true
        button.setAttribute("aria-expanded", "false")
        if (focus) {
            button.focus()
        }
        return true
    }

    function open() {
        panel.hidden = false
        button.setAttribute("aria-expanded", "true")
        actions[0]?.focus()
    }

    button.addEventListener("click", () => {
        if (isOpen()) {
            close()
        } else {
            open()
        }
    })
    root.addEventListener("keydown", event => {
        if (event.key === "Escape" && close({ focus: true })) {
            event.preventDefault()
        }
    })
    root.appendChild(button)
    root.appendChild(panel)

    return { root, panel, button, close, isOpen }
}
