class FakeNode {
    constructor() {
        this.children = []
    }

    appendChild(child) {
        child.parentNode = this
        this.children.push(child)
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

class FakeElement extends FakeNode {
    constructor(tagName, ownerDocument = null) {
        super()
        this.tagName = tagName.toUpperCase()
        this.id = ""
        this.name = ""
        this.type = ""
        this.value = ""
        this.className = ""
        this.disabled = false
        this.hidden = false
        this.checked = false
        this.listeners = new Map()
        this.attributes = new Map()
        this.dataset = {}
        this.parentNode = null
        this.ownerDocument = ownerDocument
        this.valid = true
        this.reportValidityCalls = 0
    }

    addEventListener(type, listener) {
        const listeners = this.listeners.get(type) ?? []
        listeners.push(listener)
        this.listeners.set(type, listeners)
    }

    getAttribute(name) {
        return this.attributes.get(name) ?? null
    }

    setAttribute(name, value) {
        this.attributes.set(name, String(value))
    }

    removeAttribute(name) {
        this.attributes.delete(name)
    }

    checkValidity() {
        if (this.tagName === "FORM" && this.valid) {
            return this.elements.every(
                control => control.checkValidity()
            )
        }

        return this.valid
    }

    reportValidity() {
        this.reportValidityCalls += 1

        if (this.tagName === "FORM") {
            const firstInvalidControl = this.elements.find(
                control => !control.checkValidity()
            )
            firstInvalidControl?.focus()
        }

        return this.checkValidity()
    }

    focus() {
        if (this.ownerDocument !== null) {
            this.ownerDocument.activeElement = this
        }
    }

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
        formControls.namedItem = name =>
            formControls.find(
                control => control.name === name || control.id === name
            ) ?? null
        return formControls
    }

    async click() {
        if (this.disabled) {
            return
        }

        return this.dispatch("click")
    }

    async input(value) {
        this.value = value
        return this.dispatch("input")
    }

    async submit() {
        return this.dispatch("submit")
    }

    async dispatch(type) {
        const event = {
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
        this.activeElement = this.body
        this.elementsById = new Map()
    }

    createElement(tagName) {
        return new FakeElement(tagName, this)
    }

    createTextNode(text) {
        return new FakeTextNode(text)
    }

    getElementById(id) {
        return this.elementsById.get(id) ?? null
    }

    registerElement(element) {
        this.elementsById.set(element.id, element)
    }
}

class FakeHeaders {
    constructor(headers) {
        this.headers = new Map(
            Object.entries(headers).map(([name, value]) => [
                name.toLowerCase(),
                value
            ])
        )
    }

    get(name) {
        return this.headers.get(name.toLowerCase()) ?? null
    }
}

export function createFetchResponse({
    body,
    contentType,
    headers = {},
    status = 200
}) {
    const serializedBody = body === undefined || body === null
        ? ""
        : typeof body === "string"
            ? body
            : JSON.stringify(body)
    const responseHeaders = { ...headers }
    const defaultContentType = serializedBody === ""
        ? null
        : "application/json"
    const responseContentType = contentType ?? defaultContentType

    if (responseContentType !== null) {
        responseHeaders["content-type"] = responseContentType
    }

    return {
        headers: new FakeHeaders(responseHeaders),
        ok: status >= 200 && status < 300,
        status,
        async json() {
            return JSON.parse(serializedBody)
        },
        async text() {
            return serializedBody
        }
    }
}

export function installTestBrowser(
    fetchHandler,
    {
        authHandler = null,
        initialUrl = "https://localhost/",
        songBookHandler = null
    } = {}
) {
    const document = new FakeDocument()
    const confirmations = []
    const confirmationResults = []
    const shellElements = [
        ["button", "new-song-button", "New song"],
        ["button", "refresh-songs-button", "Refresh songs"],
        ["p", "app-status", ""],
        ["p", "auth-summary", "Checking session..."],
        ["button", "show-login-button", "Sign in", true],
        ["button", "show-register-button", "Register", true],
        ["button", "logout-button", "Sign out", true],
        ["section", "auth-panel", "", true],
        [
            "h2",
            "auth-panel-heading",
            "Account",
            false,
            "auth-panel"
        ],
        [
            "button",
            "close-auth-panel-button",
            "Close",
            false,
            "auth-panel"
        ],
        ["form", "login-form", "", true, "auth-panel"],
        ["input", "login-email", "", false, "login-form", "email"],
        [
            "input",
            "login-password",
            "",
            false,
            "login-form",
            "password"
        ],
        [
            "input",
            "login-remember-me",
            "",
            false,
            "login-form",
            "rememberMe"
        ],
        [
            "button",
            "show-resend-confirmation-button",
            "Resend confirmation",
            false,
            "login-form"
        ],
        [
            "button",
            "show-forgot-password-button",
            "Forgot password",
            false,
            "login-form"
        ],
        ["form", "register-form", "", true, "auth-panel"],
        [
            "input",
            "register-email",
            "",
            false,
            "register-form",
            "email"
        ],
        [
            "input",
            "register-password",
            "",
            false,
            "register-form",
            "password"
        ],
        [
            "input",
            "register-confirm-password",
            "",
            false,
            "register-form",
            "confirmPassword"
        ],
        [
            "form",
            "resend-confirmation-form",
            "",
            true,
            "auth-panel"
        ],
        [
            "input",
            "resend-confirmation-email",
            "",
            false,
            "resend-confirmation-form",
            "email"
        ],
        [
            "form",
            "forgot-password-form",
            "",
            true,
            "auth-panel"
        ],
        [
            "input",
            "forgot-password-email",
            "",
            false,
            "forgot-password-form",
            "email"
        ],
        [
            "form",
            "reset-password-form",
            "",
            true,
            "auth-panel"
        ],
        [
            "input",
            "reset-password-email",
            "",
            false,
            "reset-password-form",
            "email"
        ],
        [
            "input",
            "reset-password-code",
            "",
            false,
            "reset-password-form",
            "code"
        ],
        [
            "input",
            "reset-password-new-password",
            "",
            false,
            "reset-password-form",
            "newPassword"
        ],
        [
            "input",
            "reset-password-confirm-password",
            "",
            false,
            "reset-password-form",
            "confirmPassword"
        ],
        ["button", "new-song-book-button", "New song book", true],
        [
            "button",
            "refresh-song-books-button",
            "Refresh song books",
            true
        ],
        ["h2", "song-book-list-heading", "Song books"],
        [
            "p",
            "song-book-list-state",
            "Sign in to load song books."
        ],
        ["ul", "song-book-list", ""],
        ["form", "song-book-form", "", true],
        [
            "h3",
            "song-book-form-heading",
            "Song-book editor",
            false,
            "song-book-form"
        ],
        [
            "input",
            "song-book-name",
            "",
            false,
            "song-book-form",
            "name"
        ],
        [
            "button",
            "cancel-song-book-button",
            "Cancel",
            false,
            "song-book-form"
        ],
        [
            "button",
            "save-song-book-button",
            "Save song book",
            false,
            "song-book-form"
        ],
        ["section", "selected-song-book-panel", "", true],
        [
            "h3",
            "selected-song-book-heading",
            "Selected song book",
            false,
            "selected-song-book-panel"
        ],
        [
            "button",
            "rename-song-book-button",
            "Rename",
            true,
            "selected-song-book-panel"
        ],
        [
            "button",
            "delete-song-book-button",
            "Delete song book",
            true,
            "selected-song-book-panel"
        ],
        [
            "section",
            "song-book-access-panel",
            "",
            true,
            "selected-song-book-panel"
        ],
        [
            "p",
            "song-book-access-state",
            "",
            false,
            "song-book-access-panel"
        ],
        [
            "ul",
            "song-book-access-list",
            "",
            false,
            "song-book-access-panel"
        ],
        [
            "form",
            "song-book-access-form",
            "",
            false,
            "song-book-access-panel"
        ],
        [
            "input",
            "song-book-access-email",
            "",
            false,
            "song-book-access-form",
            "email"
        ],
        [
            "select",
            "song-book-access-level",
            "",
            false,
            "song-book-access-form",
            "accessLevel"
        ],
        [
            "button",
            "save-song-book-access-button",
            "Save access",
            false,
            "song-book-access-form"
        ],
        ["p", "write-access-message", "", true],
        ["h2", "song-list-heading", "Songs"],
        ["p", "song-list-state", "Loading songs..."],
        ["ul", "song-list", ""],
        ["div", "song-details", ""],
        ["form", "song-form", "", true],
        ["h3", "song-form-heading", "Song editor", false, "song-form"],
        [
            "input",
            "song-title",
            "",
            false,
            "song-form",
            "title"
        ],
        [
            "input",
            "song-author",
            "",
            false,
            "song-form",
            "author"
        ],
        [
            "input",
            "song-original-title",
            "",
            false,
            "song-form",
            "originalTitle"
        ],
        [
            "input",
            "song-number",
            "",
            false,
            "song-form",
            "number"
        ],
        [
            "input",
            "song-key",
            "",
            false,
            "song-form",
            "key"
        ],
        [
            "input",
            "song-tempo",
            "",
            false,
            "song-form",
            "tempo"
        ],
        ["div", "parts-editor", "", false, "song-form"],
        ["button", "add-part-button", "Add part", false, "song-form"],
        ["p", "song-form-status", "", false, "song-form"],
        ["button", "cancel-song-button", "Cancel", false, "song-form"],
        ["button", "save-song-button", "Save song", false, "song-form"]
    ]

    for (
        const [
            tagName,
            id,
            text,
            hidden = false,
            parentId = null,
            name = ""
        ] of shellElements
    ) {
        const element = document.createElement(tagName)
        element.id = id
        element.name = name
        element.hidden = hidden
        element.textContent = text
        document.registerElement(element)
        const parent = parentId === null
            ? document.body
            : document.getElementById(parentId)
        parent.appendChild(element)
    }

    document.getElementById("song-book-access-level").value = "reader"
    const songList = document.getElementById("song-list")
    const songBookList = document.getElementById("song-book-list")

    const requests = []
    const songBookRequests = []
    const authRequests = []
    const location = new URL(initialUrl)

    globalThis.document = document
    globalThis.window = {
        confirm(message) {
            confirmations.push(message)
            return confirmationResults.shift() ?? true
        },
        location,
        history: {
            state: null,
            replaceState(state, _title, url) {
                this.state = state
                const replacement = new URL(url, location)
                location.href = replacement.href
            }
        }
    }
    globalThis.fetch = async (url, options = {}) => {
        const request = {
            body: options.body ?? null,
            credentials: options.credentials,
            headers: Object.fromEntries(
                new Headers(options.headers ?? {}).entries()
            ),
            method: options.method ?? "GET",
            url: String(url)
        }

        if (request.url === "/auth/antiforgery") {
            return createFetchResponse({
                body: { token: "test-antiforgery-token" }
            })
        }

        if (request.url.startsWith("/auth/")) {
            if (authHandler === null) {
                if (request.url === "/auth/me") {
                    return createFetchResponse({
                        body: {
                            isAuthenticated: true,
                            email: "editor@example.com"
                        }
                    })
                }

                return createFetchResponse({
                    body: null,
                    status: 204
                })
            }

            authRequests.push(request)
            return createFetchResponse(await authHandler(request))
        }

        if (request.url.startsWith("/songbooks")) {
            const segments = new URL(
                request.url,
                "https://localhost/"
            ).pathname.split("/").filter(Boolean)
            const songsIndex = segments.indexOf("songs")

            if (songsIndex !== -1) {
                requests.push(request)
                const songSegments = segments.slice(songsIndex + 1)
                const legacyRequest = {
                    ...request,
                    url: songSegments.length === 0
                        ? "/songs"
                        : `/songs/${songSegments.join("/")}`
                }
                return createFetchResponse(
                    await fetchHandler(legacyRequest)
                )
            }

            songBookRequests.push(request)

            if (songBookHandler !== null) {
                return createFetchResponse(
                    await songBookHandler(request)
                )
            }

            if (request.method === "GET" && segments.length === 1) {
                return createFetchResponse({
                    body: [{
                        id: "default-book",
                        name: "Default song book",
                        accessLevel: "admin",
                        songCount: 0
                    }]
                })
            }

            if (
                request.method === "GET" &&
                segments.length === 2
            ) {
                return createFetchResponse({
                    body: {
                        id: segments[1],
                        name: "Default song book",
                        accessLevel: "admin",
                        songCount: 0
                    }
                })
            }

            if (
                request.method === "GET" &&
                segments.at(-1) === "access"
            ) {
                return createFetchResponse({ body: [] })
            }

            return createFetchResponse({
                body: { title: "Unexpected song-book request" },
                status: 500
            })
        }

        requests.push(request)
        return createFetchResponse(await fetchHandler(request))
    }

    return {
        document,
        confirmations,
        requests,
        songBookRequests,
        authRequests,
        location,
        songList,
        queueConfirmResult(result) {
            confirmationResults.push(result)
        },
        getElement(id) {
            return document.getElementById(id)
        },
        getButton(label) {
            return findElements(document.body, element =>
                element.tagName === "BUTTON" &&
                element.textContent === label &&
                !isEffectivelyHidden(element)
            )[0]
        },
        getButtons(label) {
            return findElements(document.body, element =>
                element.tagName === "BUTTON" &&
                element.textContent === label &&
                !isEffectivelyHidden(element)
            )
        },
        findElements(predicate) {
            return findElements(document.body, predicate)
        },
        getSongListText() {
            return songList.children.map(child => child.textContent)
        },
        getSongSummaries() {
            return findElements(
                songList,
                element => element.className === "song-list__summary"
            ).map(element => element.textContent)
        },
        getSongBookSummaries() {
            return findElements(
                songBookList,
                element =>
                    element.className === "song-book-list__summary"
            ).map(element => element.textContent)
        }
    }
}

function isEffectivelyHidden(element) {
    let current = element

    while (current !== null) {
        if (current.hidden === true) {
            return true
        }

        current = current.parentNode
    }

    return false
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
