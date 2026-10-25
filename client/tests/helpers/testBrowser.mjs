class FakeNode {
    constructor() {
        this.children = []
    }

    appendChild(child) {
        return this.insertBefore(child, null)
    }

    insertBefore(child, reference) {
        if (reference !== null && !this.children.includes(reference)) {
            throw new Error("Reference node is not a child.")
        }

        child.parentNode?.removeChild(child)
        const index = reference === null
            ? this.children.length
            : this.children.indexOf(reference)
        this.children.splice(index, 0, child)
        child.parentNode = this
        return child
    }

    removeChild(child) {
        const index = this.children.indexOf(child)
        if (index === -1) {
            throw new Error("Node is not a child.")
        }

        this.children.splice(index, 1)
        child.parentNode = null
        return child
    }

    replaceChildren(...children) {
        for (const child of this.children) {
            child.parentNode = null
        }

        for (const child of children) {
            child.parentNode = this
        }

        this.children = children
    }

    get textContent() {
        return this.children.map(child => child.textContent).join("")
    }

    set textContent(value) {
        this.replaceChildren(
            ...(
                value === ""
                    ? []
                    : [new FakeTextNode(String(value))]
            )
        )
    }
}

class FakeTextNode {
    constructor(text) {
        this.parentNode = null
        this.text = text
    }

    get textContent() {
        return this.text
    }
}

class FakeClassList {
    constructor(element) {
        this.element = element
    }

    add(...tokens) {
        const classes = this.read()
        for (const token of tokens) {
            classes.add(String(token))
        }
        this.write(classes)
    }

    remove(...tokens) {
        const classes = this.read()
        for (const token of tokens) {
            classes.delete(String(token))
        }
        this.write(classes)
    }

    toggle(token, force) {
        const classes = this.read()
        const value = String(token)
        const shouldAdd = force === undefined
            ? !classes.has(value)
            : Boolean(force)

        if (shouldAdd) {
            classes.add(value)
        } else {
            classes.delete(value)
        }

        this.write(classes)
        return shouldAdd
    }

    contains(token) {
        return this.read().has(String(token))
    }

    read() {
        return new Set(
            String(this.element.className)
                .split(/\s+/)
                .filter(Boolean)
        )
    }

    write(classes) {
        this.element.className = [...classes].join(" ")
    }
}

class FakeElement extends FakeNode {
    constructor(tagName, ownerDocument = null) {
        super()
        this.tagName = tagName.toUpperCase()
        this.id = ""
        this.name = ""
        this.type = ""
        this.value = ""
        this.className = ""
        this.disabledState = false
        this.hiddenState = false
        this.checked = false
        this.listeners = new Map()
        this.attributes = new Map()
        this.dataset = {}
        this.classList = new FakeClassList(this)
        this.parentNode = null
        this.ownerDocument = ownerDocument
        this.valid = true
        this.reportValidityCalls = 0
        this.open = false
        this.returnValue = ""
    }

    addEventListener(type, listener) {
        const listeners = this.listeners.get(type) ?? []
        listeners.push(listener)
        this.listeners.set(type, listeners)
    }

    removeEventListener(type, listener) {
        const listeners = this.listeners.get(type) ?? []
        this.listeners.set(
            type,
            listeners.filter(candidate => candidate !== listener)
        )
    }

    getAttribute(name) {
        return this.attributes.get(name) ?? null
    }

    setAttribute(name, value) {
        const normalizedName = String(name).toLowerCase()
        const normalizedValue = String(value)
        this.attributes.set(normalizedName, normalizedValue)

        if (normalizedName === "id") {
            this.id = normalizedValue
        } else if (normalizedName === "name") {
            this.name = normalizedValue
        } else if (normalizedName === "type") {
            this.type = normalizedValue
        } else if (normalizedName === "value") {
            this.value = normalizedValue
        } else if (normalizedName === "class") {
            this.className = normalizedValue
        } else if (normalizedName === "href") {
            this.href = normalizedValue
        } else if (normalizedName === "hidden") {
            this.hidden = true
        } else if (normalizedName === "checked") {
            this.checked = true
        } else if (normalizedName.startsWith("data-")) {
            const key = normalizedName.slice(5).replace(
                /-([a-z])/g,
                (_match, character) => character.toUpperCase()
            )
            this.dataset[key] = normalizedValue
        }
    }

    removeAttribute(name) {
        const normalizedName = String(name).toLowerCase()
        this.attributes.delete(normalizedName)
        if (normalizedName === "hidden") {
            this.hidden = false
        } else if (normalizedName === "checked") {
            this.checked = false
        } else if (normalizedName.startsWith("data-")) {
            const key = normalizedName.slice(5).replace(
                /-([a-z])/g,
                (_match, character) => character.toUpperCase()
            )
            delete this.dataset[key]
        }
    }

    // Browsers blur a focused control once it is disabled or hidden.
    get disabled() {
        return this.disabledState
    }

    set disabled(value) {
        this.disabledState = Boolean(value)
        if (
            this.disabledState &&
            this.ownerDocument?.focusedElement === this
        ) {
            this.ownerDocument.focusedElement = this.ownerDocument.body
        }
    }

    get hidden() {
        return this.hiddenState
    }

    set hidden(value) {
        this.hiddenState = Boolean(value)
        const document = this.ownerDocument
        if (
            this.hiddenState &&
            document !== null &&
            document !== undefined &&
            document.focusedElement !== document.body &&
            this.contains(document.focusedElement)
        ) {
            document.focusedElement = document.body
        }
    }

    get href() {
        return this.attributes.get("href") ?? ""
    }

    set href(value) {
        this.attributes.set("href", String(value))
    }

    get isConnected() {
        let current = this
        while (current !== null) {
            if (current === this.ownerDocument?.body) {
                return true
            }
            current = current.parentNode
        }

        return false
    }

    get form() {
        let current = this.parentNode
        while (current !== null) {
            if (current.tagName === "FORM") {
                return current
            }
            current = current.parentNode
        }

        return null
    }

    contains(node) {
        if (node === this) {
            return true
        }

        return this.children.some(child =>
            child === node ||
            (child instanceof FakeElement && child.contains(node))
        )
    }

    checkValidity() {
        if (this.tagName === "FORM" && this.valid) {
            for (const control of this.elements) {
                if (!control.checkValidity()) {
                    return false
                }
            }
        }

        return this.valid
    }

    reportValidity() {
        this.reportValidityCalls += 1

        if (this.tagName === "FORM") {
            for (const control of this.elements) {
                if (!control.checkValidity()) {
                    control.focus()
                    break
                }
            }
        }

        return this.checkValidity()
    }

    focus() {
        if (this.ownerDocument !== null && isFocusable(this)) {
            this.ownerDocument.activeElement = this
        }
    }

    remove() {
        this.parentNode?.removeChild(this)
    }

    scrollIntoView() {}

    select() {}

    get elements() {
        const formControls = findElements(
            this,
            element => [
                "BUTTON",
                "INPUT",
                "SELECT",
                "TEXTAREA"
            ].includes(element.tagName)
        )
        const collection = {
            length: formControls.length,
            item(index) {
                return formControls[index] ?? null
            },
            namedItem(name) {
                return formControls.find(
                    control => control.name === name || control.id === name
                ) ?? null
            },
            [Symbol.iterator]() {
                return formControls[Symbol.iterator]()
            }
        }
        for (let index = 0; index < formControls.length; index += 1) {
            collection[index] = formControls[index]
        }
        return collection
    }

    async click() {
        if (this.disabled) {
            return
        }

        const event = await this.dispatch("click")
        if (
            !this.ownerDocument?.appBrowser ||
            event.defaultPrevented
        ) {
            return event
        }

        if (
            this.tagName === "A" &&
            this.getAttribute("download") !== null
        ) {
            this.ownerDocument.appBrowser.downloads.push({
                href: this.getAttribute("href"),
                filename: this.getAttribute("download")
            })
        } else if (this.tagName === "A" && this.href.startsWith("#")) {
            await this.ownerDocument.appBrowser.navigate(this.href)
        } else if (
            this.tagName === "BUTTON" &&
            this.type.toLowerCase() === "submit"
        ) {
            await this.form?.dispatch("submit", { submitter: this })
        } else if (
            this.tagName === "INPUT" &&
            ["checkbox", "radio"].includes(this.type.toLowerCase())
        ) {
            if (this.type.toLowerCase() === "checkbox") {
                this.checked = !this.checked
            } else {
                const scope = this.form ?? this.ownerDocument.body
                for (const control of findElements(
                    scope,
                    candidate =>
                        candidate.tagName === "INPUT" &&
                        candidate.type.toLowerCase() === "radio" &&
                        candidate.name === this.name
                )) {
                    control.checked = false
                }
                this.checked = true
            }

            await this.dispatch("change")
        }

        return event
    }

    async input(value) {
        this.value = value
        return this.dispatch("input")
    }

    async change(value) {
        this.value = value
        return this.dispatch("change")
    }

    async keydown(key, modifiers = {}) {
        const event = await this.dispatch("keydown", {
            ...modifiers,
            key
        })

        if (key === "Escape" && this.ownerDocument?.appBrowser) {
            const dialog = findElements(
                this.ownerDocument.body,
                element => element.tagName === "DIALOG" && element.open
            ).find(element =>
                element === this ||
                element.contains(this) ||
                element.contains(this.ownerDocument.activeElement)
            )
            if (dialog !== undefined) {
                const cancelEvent = await dialog.dispatch("cancel")
                if (!cancelEvent.defaultPrevented && dialog.open) {
                    dialog.close("")
                }
            }
        }

        return event
    }

    async submit() {
        return this.dispatch("submit")
    }

    showModal() {
        if (this.tagName !== "DIALOG") {
            throw new TypeError("showModal is only available on a dialog.")
        }
        if (this.open) {
            throw new Error("The dialog is already open.")
        }

        this.open = true
        this.returnValue = ""

        const browser = this.ownerDocument?.appBrowser
        if (browser === null || browser === undefined) {
            return
        }

        browser.dialogs.push({
            title: findElements(this, element => element.id === "dialog-title")[0]
                ?.textContent ?? "",
            message: findElements(this, element => element.id === "dialog-message")[0]
                ?.textContent ?? ""
        })

        if (browser.dialogAnswers.length === 0) {
            return
        }

        const answer = browser.dialogAnswers.shift()
        queueMicrotask(async () => {
            if (!this.open) {
                return
            }

            if (typeof answer === "string") {
                const input = findElements(
                    this,
                    element => element.id === "dialog-input"
                )[0]
                if (input !== undefined) {
                    input.value = answer
                }
            }

            const buttonId = typeof answer === "string" || answer === true
                ? "dialog-confirm"
                : "dialog-cancel"
            const button = findElements(
                this,
                element => element.id === buttonId
            )[0]
            if (button !== undefined) {
                await button.click()
            } else {
                this.close(buttonId === "dialog-confirm" ? "confirm" : "cancel")
            }
        })
    }

    close(value = "") {
        if (this.tagName !== "DIALOG") {
            throw new TypeError("close is only available on a dialog.")
        }

        this.open = false
        this.returnValue = String(value)
        void this.dispatch("close")
    }

    async dispatch(type, properties = {}) {
        const event = {
            ...properties,
            currentTarget: null,
            defaultPrevented: false,
            preventDefault() {
                this.defaultPrevented = true
            },
            target: this,
            type
        }

        let currentTarget = this

        while (currentTarget !== null) {
            event.currentTarget = currentTarget

            for (
                const listener of
                currentTarget.listeners?.get(type) ?? []
            ) {
                await listener(event)
            }

            currentTarget = currentTarget.parentNode
        }

        return event
    }
}

class FakeDocument {
    constructor() {
        this.body = new FakeElement("body", this)
        this.focusedElement = this.body
        this.elementsById = new Map()
        this.title = ""
        this.appBrowser = null
    }

    // Browsers move focus to the body when the focused element is removed.
    get activeElement() {
        return this.focusedElement?.isConnected
            ? this.focusedElement
            : this.body
    }

    set activeElement(element) {
        this.focusedElement = element ?? this.body
    }

    createElement(tagName) {
        return new FakeElement(tagName, this)
    }

    createTextNode(text) {
        return new FakeTextNode(text)
    }

    getElementById(id) {
        if (this.elementsById.has(id)) {
            return this.elementsById.get(id)
        }
        if (this.appBrowser === null) {
            return null
        }
        return findElements(this.body, element => element.id === id)[0] ?? null
    }

    registerElement(element) {
        this.elementsById.set(element.id, element)
    }
}

function findElements(root, predicate) {
    const matches = []

    for (const child of root.children ?? []) {
        if (child instanceof FakeElement) {
            if (predicate(child)) {
                matches.push(child)
            }

            matches.push(...findElements(child, predicate))
        }
    }

    return matches
}

// Mirrors browsers: focus() ignores elements that cannot take focus.
function isFocusable(element) {
    if (!element.isConnected || element.disabled === true) {
        return false
    }

    const tagName = element.tagName
    const focusable = tagName === "BODY" ||
        tagName === "BUTTON" ||
        tagName === "SELECT" ||
        tagName === "TEXTAREA" ||
        (tagName === "INPUT" && element.type.toLowerCase() !== "hidden") ||
        (tagName === "A" && element.getAttribute("href") !== null) ||
        element.getAttribute("tabindex") !== null
    if (!focusable) {
        return false
    }

    for (
        let current = element;
        current !== null && current !== undefined;
        current = current.parentNode
    ) {
        if (
            current.hidden === true ||
            (current.tagName === "DIALOG" && !current.open)
        ) {
            return false
        }
    }

    return true
}

export const APP_SHELL_IDS = Object.freeze([
    "app-bar",
    "app-home-link",
    "app-breadcrumb",
    "account-menu",
    "screen",
    "app-status",
    "app-dialog"
])

export function installAppBrowser({
    api,
    initialUrl = "https://localhost/"
} = {}) {
    if (api === null || typeof api?.handle !== "function") {
        throw new TypeError("An API with a handle(request) method is required.")
    }

    const previousGlobals = new Map(
        ["document", "window", "location", "fetch"].map(name => [
            name,
            {
                hadOwnProperty: Object.hasOwn(globalThis, name),
                value: globalThis[name]
            }
        ])
    )
    const document = new FakeDocument()
    const location = new URL(initialUrl)
    const dialogs = []
    const downloads = []
    const dialogAnswers = []
    const windowListeners = new Map()
    const historyEntries = [{ state: null, url: location.href }]
    let historyIndex = 0

    const appBar = createShellElement(
        document,
        "header",
        "app-bar",
        "app-bar",
        document.body
    )
    const homeLink = createShellElement(
        document,
        "a",
        "app-home-link",
        "app-bar__brand",
        appBar,
        "Śpiewnik SpoTkanie"
    )
    homeLink.href = "#/"

    const breadcrumb = createShellElement(
        document,
        "nav",
        "app-breadcrumb",
        "app-bar__breadcrumb",
        appBar
    )
    breadcrumb.setAttribute("aria-label", "Breadcrumb")

    const accountMenu = createShellElement(
        document,
        "div",
        "account-menu",
        "app-bar__account",
        appBar
    )
    accountMenu.hidden = true

    createShellElement(
        document,
        "main",
        "screen",
        "screen",
        document.body
    )

    const status = createShellElement(
        document,
        "div",
        "app-status",
        "status",
        document.body
    )
    status.setAttribute("role", "status")
    status.setAttribute("aria-live", "polite")
    status.setAttribute("aria-atomic", "true")

    const dialog = createShellElement(
        document,
        "dialog",
        "app-dialog",
        "dialog",
        document.body
    )
    dialog.setAttribute("aria-labelledby", "dialog-title")

    async function dispatchWindowEvent(type, properties = {}) {
        const event = {
            ...properties,
            currentTarget: null,
            defaultPrevented: false,
            preventDefault() {
                this.defaultPrevented = true
            },
            target: windowObject,
            type
        }

        event.currentTarget = windowObject
        for (const listener of [...(windowListeners.get(type) ?? [])]) {
            await listener(event)
        }

        return event
    }

    const history = {
        state: null,
        scrollRestoration: "auto",
        pushState(state, _title, url) {
            const nextUrl = url === undefined
                ? new URL(location.href)
                : new URL(url, location.href)
            historyEntries.splice(historyIndex + 1)
            historyEntries.push({ state, url: nextUrl.href })
            historyIndex = historyEntries.length - 1
            this.state = state
            location.href = nextUrl.href
        },
        replaceState(state, _title, url) {
            const nextUrl = url === undefined
                ? new URL(location.href)
                : new URL(url, location.href)
            historyEntries[historyIndex] = {
                state,
                url: nextUrl.href
            }
            this.state = state
            location.href = nextUrl.href
        },
        async back() {
            await traverseHistory(-1)
        },
        async forward() {
            await traverseHistory(1)
        }
    }

    const windowObject = {
        location,
        history,
        scrollY: 0,
        addEventListener(type, listener) {
            const listeners = windowListeners.get(type) ?? []
            listeners.push(listener)
            windowListeners.set(type, listeners)
        },
        removeEventListener(type, listener) {
            const listeners = windowListeners.get(type) ?? []
            windowListeners.set(
                type,
                listeners.filter(candidate => candidate !== listener)
            )
        },
        dispatch: dispatchWindowEvent,
        scrollTo(x, y) {
            this.scrollY = typeof x === "object"
                ? Number(x.top ?? 0)
                : Number(y ?? 0)
        }
    }

    async function dispatchHashchange(oldUrl) {
        const newUrl = new URL(location.href)
        if (oldUrl.hash !== newUrl.hash) {
            await windowObject.dispatch("hashchange", {
                newURL: newUrl.href,
                oldURL: oldUrl.href
            })
        }
    }

    async function traverseHistory(offset) {
        const nextIndex = historyIndex + offset
        if (nextIndex < 0 || nextIndex >= historyEntries.length) {
            return
        }

        const oldUrl = new URL(location.href)
        historyIndex = nextIndex
        const entry = historyEntries[historyIndex]
        history.state = entry.state
        location.href = entry.url
        await dispatchHashchange(oldUrl)
    }

    const browser = {
        api,
        document,
        dialogs,
        downloads,
        dialogAnswers,
        history,
        location,
        window: windowObject,
        async navigate(hash) {
            const oldUrl = new URL(location.href)
            history.pushState(null, "", hash)
            await dispatchHashchange(oldUrl)
        },
        async back() {
            await history.back()
        },
        async forward() {
            await history.forward()
        },
        screen() {
            return document.getElementById("screen")?.dataset.screen
        },
        text(id) {
            return document.getElementById(id)?.textContent ?? ""
        },
        queueDialogAnswer(answer) {
            if (
                typeof answer !== "boolean" &&
                typeof answer !== "string"
            ) {
                throw new TypeError(
                    "A dialog answer must be a boolean or string."
                )
            }
            dialogAnswers.push(answer)
        },
        async settle() {
            for (let index = 0; index < 3; index++) {
                await Promise.resolve()
                await new Promise(resolve => setImmediate(resolve))
            }
        },
        restore() {
            for (const [name, assignedValue] of [
                ["document", document],
                ["window", windowObject],
                ["location", location],
                ["fetch", fetchHandler]
            ]) {
                if (globalThis[name] !== assignedValue) {
                    continue
                }

                const previous = previousGlobals.get(name)
                if (previous.hadOwnProperty) {
                    globalThis[name] = previous.value
                } else {
                    delete globalThis[name]
                }
            }
        }
    }

    document.appBrowser = browser
    document.title = "Śpiewnik SpoTkanie"

    const fetchHandler = async (url, options = {}) => {
        const signal = options.signal
        if (signal?.aborted) {
            throw createAbortError()
        }

        const parsedUrl = new URL(String(url), location.href)
        const headers = Object.fromEntries(
            new Headers(options.headers ?? {}).entries()
        )
        const request = {
            method: String(options.method ?? "GET").toUpperCase(),
            path: parsedUrl.pathname,
            query: Object.fromEntries(parsedUrl.searchParams.entries()),
            body: parseRequestBody(options.body),
            headers
        }
        Object.defineProperty(request, "signal", {
            value: signal ?? null,
            enumerable: false
        })
        const apiRequest = Promise.resolve().then(
            () => api.handle(request)
        )

        if (signal === undefined) {
            return apiRequest
        }

        let onAbort
        const abortRequest = new Promise((_resolve, reject) => {
            onAbort = () => reject(createAbortError())
            signal.addEventListener("abort", onAbort, { once: true })
        })

        try {
            return await Promise.race([apiRequest, abortRequest])
        } finally {
            signal.removeEventListener("abort", onAbort)
        }
    }

    for (const [name, value] of [
        ["document", document],
        ["window", windowObject],
        ["location", location],
        ["fetch", fetchHandler]
    ]) {
        globalThis[name] = value
    }

    return browser
}

function createShellElement(
    document,
    tagName,
    id,
    className,
    parent,
    text = ""
) {
    const element = document.createElement(tagName)
    element.id = id
    element.className = className
    element.textContent = text
    document.registerElement(element)
    parent.appendChild(element)
    return element
}

function parseRequestBody(body) {
    if (body === undefined || body === null || typeof body !== "string") {
        return body ?? null
    }

    try {
        return JSON.parse(body)
    } catch {
        return body
    }
}

function createAbortError() {
    return new DOMException("The operation was aborted.", "AbortError")
}
