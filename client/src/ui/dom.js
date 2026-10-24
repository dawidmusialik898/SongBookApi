export function h(tagName, props = {}, ...children) {
    const element = document.createElement(tagName)

    for (const [name, value] of Object.entries(props)) {
        if (value === undefined || value === null) {
            continue
        }

        switch (name) {
            case "id":
                element.id = String(value)
                element.setAttribute("id", String(value))
                break
            case "className":
                element.className = String(value)
                element.setAttribute("class", String(value))
                break
            case "text":
                element.textContent = String(value)
                break
            case "type":
                element.type = String(value)
                element.setAttribute("type", String(value))
                break
            case "hidden":
                element.hidden = Boolean(value)
                if (value) {
                    element.setAttribute("hidden", "")
                } else {
                    element.removeAttribute("hidden")
                }
                break
            case "disabled":
                element.disabled = Boolean(value)
                if (value) {
                    element.setAttribute("disabled", "")
                } else {
                    element.removeAttribute("disabled")
                }
                break
            case "dataset":
                for (const [key, entry] of Object.entries(value)) {
                    if (entry === undefined || entry === null) {
                        continue
                    }
                    const stringValue = String(entry)
                    element.dataset[key] = stringValue
                    element.setAttribute(
                        `data-${key.replace(/[A-Z]/g, letter =>
                            `-${letter.toLowerCase()}`
                        )}`,
                        stringValue
                    )
                }
                break
            case "attrs":
                for (const [attribute, entry] of Object.entries(value)) {
                    if (entry === undefined || entry === null ||
                        entry === false) {
                        continue
                    }
                    element.setAttribute(
                        attribute,
                        entry === true ? "" : String(entry)
                    )
                }
                break
            case "on":
                for (const [eventName, listener] of Object.entries(value)) {
                    if (typeof listener !== "function") {
                        throw new TypeError(
                            `The ${eventName} listener must be a function.`
                        )
                    }
                    element.addEventListener(eventName, listener)
                }
                break
            default:
                throw new TypeError(`Unsupported element property: ${name}`)
        }
    }

    for (const child of children) {
        appendChild(element, child)
    }

    return element
}

export function findActionTarget(target, container) {
    let current = target

    while (current !== null && current !== undefined) {
        if (current.dataset?.action !== undefined) {
            return current
        }
        if (current === container) {
            break
        }
        current = current.parentNode
    }

    return null
}

export function isInDocument(element) {
    if (element === null || element === undefined) {
        return false
    }
    if (typeof element.isConnected === "boolean") {
        return element.isConnected
    }

    return document.body.contains(element)
}

export function later(callback, delay) {
    const timer = setTimeout(callback, delay)
    timer.unref?.()
    return timer
}

function appendChild(parent, child) {
    if (child === null || child === undefined || child === false) {
        return
    }
    if (Array.isArray(child)) {
        for (const entry of child) {
            appendChild(parent, entry)
        }
        return
    }
    if (typeof child === "string" || typeof child === "number") {
        parent.appendChild(document.createTextNode(String(child)))
        return
    }

    parent.appendChild(child)
}
