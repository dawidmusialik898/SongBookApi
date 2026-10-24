import { createMenu } from "./menu.js"
import { h } from "./dom.js"

export function createShell(ctx) {
    const { elements } = ctx
    const menus = new Set()

    function registerMenu(menu) {
        menus.add(menu)
        return menu
    }

    function closeMenus({ focus = false } = {}) {
        for (const menu of menus) {
            menu.close({ focus })
        }
        menus.clear()
    }

    function closeMenusOutside(target) {
        for (const menu of menus) {
            if (menu.isOpen() && !menu.root.contains(target)) {
                menu.close()
            }
        }
    }

    function handleKeydown(event) {
        if (event.key !== "Escape") {
            return false
        }

        let closed = false
        for (const menu of menus) {
            closed = menu.close({ focus: true }) || closed
        }
        if (closed) {
            event.preventDefault()
        }
        return closed
    }

    function renderAccountMenu() {
        closeMenus()
        elements.accountMenu.replaceChildren()
        const session = ctx.session.state
        if (
            session.status !== "authenticated" ||
            session.email === null
        ) {
            elements.accountMenu.hidden = true
            return
        }

        const roleLabel = session.role === "moderator"
            ? " (Moderator)"
            : session.role === "superuser"
                ? " (SuperUser)"
                : ""
        const items = []
        if (["moderator", "superuser"].includes(session.role)) {
            items.push({
                kind: "link",
                id: "manage-users-link",
                text: "Manage users",
                href: ctx.router.href("users")
            })
        }
        items.push({
            kind: "button",
            id: "sign-out-button",
            text: "Sign out",
            action: "sign-out",
            onSelect: () => ctx.session.signOut()
        })

        const menu = createMenu({
            label: session.email,
            accessibleName: "Account menu",
            buttonId: "account-menu-button",
            id: "account-menu-panel",
            items
        })
        menu.panel.insertBefore(
            h("p", {
                className: "menu__summary",
                text: `Signed in as ${session.email}${roleLabel}`
            }),
            menu.panel.children[0] ?? null
        )
        elements.accountMenu.hidden = false
        elements.accountMenu.appendChild(menu.root)
        registerMenu(menu)
    }

    function setBreadcrumb(items) {
        elements.appBreadcrumb.replaceChildren()
        if (!Array.isArray(items) || items.length === 0) {
            return
        }

        const list = h("ol", { className: "breadcrumb__list" })
        const nearestAncestor = items
            .slice(0, -1)
            .map((item, index) => item.href ? index : -1)
            .filter(index => index !== -1)
            .at(-1)

        for (const [index, item] of items.entries()) {
            const isCurrent = index === items.length - 1
            const classes = ["breadcrumb__item"]
            if (!isCurrent) {
                classes.push("breadcrumb__item--ancestor")
                if (index === nearestAncestor) {
                    classes.push(
                        "breadcrumb__item--nearest-ancestor"
                    )
                }
            } else {
                classes.push("breadcrumb__item--current")
            }

            const content = item.href && !isCurrent
                ? h("a", {
                    attrs: { href: item.href },
                    text: item.text
                })
                : h("span", {
                    attrs: isCurrent
                        ? { "aria-current": "page" }
                        : {},
                    text: item.text
                })
            list.appendChild(h("li", {
                className: classes.join(" ")
            }, content))
        }

        elements.appBreadcrumb.appendChild(list)
    }

    function setTitle(parts) {
        const values = Array.isArray(parts) ? parts : [parts]
        const subject = values
            .filter(value => typeof value === "string" &&
                value.trim() !== "")
            .join(" · ")
        document.title = subject === ""
            ? "Śpiewnik SpoTkanie"
            : `${subject} · Śpiewnik SpoTkanie`
    }

    function setFocusMode(active) {
        elements.appBar.hidden = active === true
    }

    return {
        registerMenu,
        closeMenus,
        closeMenusOutside,
        handleKeydown,
        renderAccountMenu,
        setBreadcrumb,
        setTitle,
        setFocusMode
    }
}
