const PAGE_SIZE = 50
const ANTIFORGERY_TOKEN = "test-antiforgery-token"
const GENERIC_EMAIL_RESPONSE = "If the account is eligible, an email was sent."
const ACCESS_RANK = {
    reader: 1,
    editor: 2,
    admin: 3
}
const ROLES = ["user", "moderator", "superuser"]

export function createFakeApi() {
    const accounts = new Map()
    const books = new Map()
    const requests = []
    const interceptors = []
    const idCounters = new Map()
    let currentSession = null

    const seed = {
        account(email, {
            id,
            password = "Password123!",
            role = "user",
            confirmed = true,
            banned = false
        } = {}) {
            const emailValue = normalizeEmail(email)
            if (!isValidEmail(emailValue)) {
                throw new TypeError("A valid account email is required.")
            }
            if (!ROLES.includes(role)) {
                throw new TypeError("The account role is invalid.")
            }

            const existing = accounts.get(emailValue)
            const account = {
                id: id ?? existing?.id ?? nextId("user"),
                email: String(email).trim(),
                emailKey: emailValue,
                password,
                role,
                emailConfirmed: Boolean(confirmed),
                isBanned: Boolean(banned),
                sessionVersion: existing?.sessionVersion ?? 0
            }
            accounts.set(emailValue, account)
            return account.id
        },
        book({ id, owner, name } = {}) {
            const ownerKey = normalizeEmail(
                owner ?? getCurrentAccount()?.email
            )
            if (!accounts.has(ownerKey)) {
                throw new TypeError("The song-book owner must be seeded first.")
            }
            if (typeof name !== "string" || name.trim() === "") {
                throw new TypeError("A song-book name is required.")
            }

            const book = {
                id: id ?? nextId("book"),
                owner: ownerKey,
                name: name.trim(),
                songs: [],
                access: [],
                pdfs: [],
                contentRevision: 0
            }
            books.set(book.id, book)
            return book.id
        },
        access(bookId, email, accessLevel) {
            const book = requireBook(bookId)
            const emailKey = normalizeEmail(email)
            const account = accounts.get(emailKey)
            if (account === undefined) {
                throw new TypeError("The collaborator account must be seeded first.")
            }
            if (!["reader", "editor"].includes(accessLevel)) {
                throw new TypeError("The collaborator access level is invalid.")
            }
            if (book.owner === emailKey) {
                throw new TypeError("The song-book owner cannot be a collaborator.")
            }

            let member = book.access.find(
                candidate => candidate.emailKey === emailKey
            )
            if (member === undefined) {
                member = {
                    id: nextId("access"),
                    email: account.email,
                    emailKey,
                    accessLevel
                }
                book.access.push(member)
            } else {
                member.accessLevel = accessLevel
            }
            return member.id
        },
        song(bookId, payload = {}) {
            const book = requireBook(bookId)
            const id = payload.id ?? nextId("song")
            if (book.songs.some(song => song.id === id)) {
                throw new TypeError("Song IDs must be unique within a book.")
            }
            const result = buildSeedSong(payload, id, nextId)
            book.songs.push(result)
            return result.id
        },
        pdf(bookId, options = {}) {
            const book = requireBook(bookId)
            const pdf = makePdfMetadata(book, options, nextId)
            book.pdfs.unshift(pdf)
            return pdf.id
        }
    }

    async function handle(requestValue) {
        const request = await normalizeRequest(requestValue)
        requests.push(request)

        for (const interceptor of interceptors) {
            const intercepted = await interceptor(request)
            if (intercepted !== undefined) {
                return normalizeInterceptResponse(intercepted)
            }
        }

        if (
            request.path === "/auth/antiforgery" &&
            request.method === "GET"
        ) {
            return jsonResponse(
                { token: ANTIFORGERY_TOKEN },
                200,
                { "Cache-Control": "no-store" }
            )
        }

        if (request.path === "/auth/me" && request.method === "GET") {
            const account = getCurrentAccount()
            return jsonResponse({
                isAuthenticated: account !== null,
                email: account?.email ?? null,
                role: account?.role ?? null
            })
        }

        if (request.path.startsWith("/auth/")) {
            return handleAuthRequest(request)
        }

        let segments
        try {
            segments = request.path
                .split("/")
                .filter(Boolean)
                .map(segment => decodeURIComponent(segment))
        } catch {
            return problemResponse(400, "The request path is invalid.")
        }

        if (!["songbooks", "admin"].includes(segments[0])) {
            return emptyResponse(404)
        }

        const account = getCurrentAccount()
        if (account === null) {
            return emptyResponse(401)
        }

        if (segments[0] === "songbooks") {
            if (requiresSongBookAntiforgery(request, segments)) {
                const csrfError = requireAntiforgery(request)
                if (csrfError !== null) {
                    return csrfError
                }
            }
            return handleSongBookRequest(request, account, segments)
        }

        return handleModerationRequest(request, account, segments)
    }

    function signIn(email) {
        const emailKey = normalizeEmail(email)
        const account = accounts.get(emailKey)
        if (account === undefined) {
            throw new TypeError("The account must be seeded before sign-in.")
        }

        currentSession = {
            emailKey,
            sessionVersion: account.sessionVersion
        }
        return account.email
    }

    function intercept(handler) {
        if (typeof handler !== "function") {
            throw new TypeError("An API interceptor must be a function.")
        }

        interceptors.push(handler)
        return () => {
            const index = interceptors.indexOf(handler)
            if (index !== -1) {
                interceptors.splice(index, 1)
            }
        }
    }

    function nextId(kind) {
        let next = (idCounters.get(kind) ?? 0) + 1
        let id = `${kind}-${next}`
        while (isIdUsed(kind, id)) {
            next += 1
            id = `${kind}-${next}`
        }
        idCounters.set(kind, next)
        return id
    }

    function isIdUsed(kind, id) {
        if (kind === "user") {
            return [...accounts.values()].some(account => account.id === id)
        }
        if (kind === "book") {
            return books.has(id)
        }
        if (kind === "access") {
            return [...books.values()].some(book =>
                book.access.some(member => member.id === id)
            )
        }
        if (kind === "song") {
            return [...books.values()].some(book =>
                book.songs.some(song => song.id === id)
            )
        }
        if (kind === "part") {
            return [...books.values()].some(book =>
                book.songs.some(song =>
                    song.parts.some(part => part.id === id)
                )
            )
        }
        if (kind === "pdf") {
            return [...books.values()].some(book =>
                book.pdfs.some(pdf => pdf.id === id)
            )
        }

        return false
    }

    function requireBook(bookId) {
        const book = books.get(String(bookId))
        if (book === undefined) {
            throw new TypeError(`Song book ${bookId} has not been seeded.`)
        }
        return book
    }

    function getCurrentAccount() {
        if (currentSession === null) {
            return null
        }

        const account = accounts.get(currentSession.emailKey)
        if (
            account === undefined ||
            account.isBanned ||
            account.sessionVersion !== currentSession.sessionVersion
        ) {
            return null
        }

        return account
    }

    function getAccessLevel(book, account) {
        if (book.owner === account.emailKey) {
            return "admin"
        }

        return book.access.find(
            member => member.emailKey === account.emailKey
        )?.accessLevel ?? null
    }

    function markBookChanged(book) {
        book.contentRevision += 1
        for (const pdf of book.pdfs) {
            pdf.isOutdated = true
        }
    }

    async function handleAuthRequest(request) {
        if (
            request.path === "/auth/confirm-email" &&
            request.method === "GET"
        ) {
            const account = [...accounts.values()].find(
                candidate => candidate.id === request.query.userId
            )
            if (account !== undefined && request.query.code) {
                account.emailConfirmed = true
                return emptyResponse(302, {
                    Location: "/?auth=confirmed"
                })
            }
            return emptyResponse(302, {
                Location: "/?auth=confirmation-failed"
            })
        }

        if (request.path === "/auth/logout" && request.method === "POST") {
            if (getCurrentAccount() === null) {
                return emptyResponse(401)
            }
            const csrfError = requireAntiforgery(request)
            if (csrfError !== null) {
                return csrfError
            }
            currentSession = null
            return emptyResponse(204)
        }

        if (request.method !== "POST") {
            return emptyResponse(404)
        }

        const csrfError = requireAntiforgery(request)
        if (csrfError !== null) {
            return csrfError
        }

        if (request.path === "/auth/login") {
            const emailKey = normalizeEmail(request.body?.email)
            const account = accounts.get(emailKey)
            if (
                account === undefined ||
                account.password !== request.body?.password ||
                !account.emailConfirmed ||
                account.isBanned
            ) {
                return emptyResponse(401)
            }
            signIn(account.email)
            return emptyResponse(204)
        }

        if (request.path === "/auth/register") {
            const email = typeof request.body?.email === "string"
                ? request.body.email.trim()
                : ""
            const password = request.body?.password
            if (!isValidEmail(email) || typeof password !== "string" || password === "") {
                return validationProblem(
                    "email",
                    "A valid email and password are required."
                )
            }
            if (accounts.has(normalizeEmail(email))) {
                return validationProblem("email", "The email is already in use.")
            }
            seed.account(email, {
                password,
                role: "user",
                confirmed: false
            })
            return jsonResponse(
                { message: GENERIC_EMAIL_RESPONSE },
                202
            )
        }

        if (
            request.path === "/auth/resend-confirmation" ||
            request.path === "/auth/forgot-password"
        ) {
            return jsonResponse(
                { message: GENERIC_EMAIL_RESPONSE },
                202
            )
        }

        if (request.path === "/auth/reset-password") {
            const emailKey = normalizeEmail(request.body?.email)
            const account = accounts.get(emailKey)
            if (
                account === undefined ||
                typeof request.body?.code !== "string" ||
                request.body.code.trim() === "" ||
                typeof request.body?.newPassword !== "string" ||
                request.body.newPassword.trim() === ""
            ) {
                return validationProblem(
                    "code",
                    "The password reset request is invalid."
                )
            }
            account.password = request.body.newPassword
            account.sessionVersion += 1
            return emptyResponse(204)
        }

        return emptyResponse(404)
    }

    async function handleSongBookRequest(request, account, segments) {
        if (segments.length === 1) {
            if (request.method === "GET") {
                const page = readPageNumber(request)
                if (page.error !== undefined) {
                    return page.error
                }

                const visibleBooks = [...books.values()]
                    .filter(book => getAccessLevel(book, account) !== null)
                    .sort((left, right) =>
                        compareOrdinal(left.name, right.name) ||
                        compareOrdinal(left.id, right.id)
                    )
                    .map(book => toBookSummary(
                        book,
                        getAccessLevel(book, account)
                    ))
                return pagedResponse(visibleBooks, page.value)
            }

            if (request.method === "POST") {
                const csrfError = requireAntiforgery(request)
                if (csrfError !== null) {
                    return csrfError
                }
                const name = readBookName(request.body)
                if (name.error !== undefined) {
                    return name.error
                }
                const duplicate = [...books.values()].some(book =>
                    book.owner === account.emailKey &&
                    book.name.toLowerCase() === name.value.toLowerCase()
                )
                if (duplicate) {
                    return emptyResponse(409)
                }

                const book = {
                    id: nextId("book"),
                    owner: account.emailKey,
                    name: name.value,
                    songs: [],
                    access: [],
                    pdfs: [],
                    contentRevision: 0
                }
                books.set(book.id, book)
                return jsonResponse(toBookSummary(book, "admin"), 201, {
                    Location: `/songbooks/${encodeURIComponent(book.id)}`
                })
            }

            return emptyResponse(404)
        }

        const book = books.get(segments[1])
        if (book === undefined) {
            return emptyResponse(404)
        }

        if (segments.length === 2) {
            const accessLevel = getAccessLevel(book, account)
            if (request.method === "GET") {
                return accessLevel === null
                    ? emptyResponse(404)
                    : jsonResponse(toBookSummary(book, accessLevel))
            }

            if (request.method === "PUT" || request.method === "DELETE") {
                const denial = requireBookAccess(book, account, "admin")
                if (denial !== null) {
                    return denial
                }
                const csrfError = requireAntiforgery(request)
                if (csrfError !== null) {
                    return csrfError
                }

                if (request.method === "DELETE") {
                    books.delete(book.id)
                    return emptyResponse(204)
                }

                const name = readBookName(request.body)
                if (name.error !== undefined) {
                    return name.error
                }
                const duplicate = [...books.values()].some(candidate =>
                    candidate.id !== book.id &&
                    candidate.owner === account.emailKey &&
                    candidate.name.toLowerCase() === name.value.toLowerCase()
                )
                if (duplicate) {
                    return emptyResponse(409)
                }
                book.name = name.value
                markBookChanged(book)
                return emptyResponse(204)
            }

            return emptyResponse(404)
        }

        if (segments[2] === "access") {
            return handleBookAccessRequest(request, account, book, segments)
        }
        if (segments[2] === "songs") {
            return handleSongRequest(request, account, book, segments)
        }
        if (segments[2] === "pdfs") {
            return handlePdfRequest(request, account, book, segments)
        }

        return emptyResponse(404)
    }

    function handleBookAccessRequest(request, account, book, segments) {
        const denial = requireBookAccess(book, account, "admin")
        if (denial !== null) {
            return denial
        }

        if (segments.length === 3 && request.method === "GET") {
            const page = readPageNumber(request)
            if (page.error !== undefined) {
                return page.error
            }
            const members = [...book.access]
                .sort((left, right) =>
                    compareOrdinal(left.emailKey, right.emailKey) ||
                    compareOrdinal(left.id, right.id)
                )
                .map(toAccessSummary)
            return pagedResponse(members, page.value)
        }

        if (segments.length === 3 && request.method === "PUT") {
            const csrfError = requireAntiforgery(request)
            if (csrfError !== null) {
                return csrfError
            }
            const email = typeof request.body?.email === "string"
                ? request.body.email.trim()
                : ""
            const emailKey = normalizeEmail(email)
            const memberAccount = accounts.get(emailKey)
            if (!isValidEmail(email)) {
                return validationProblem("email", "A valid email address is required.")
            }
            if (
                !["reader", "editor"].includes(
                    request.body?.accessLevel
                )
            ) {
                return validationProblem(
                    "accessLevel",
                    "Access level must be reader or editor."
                )
            }
            if (memberAccount === undefined || book.owner === emailKey) {
                return emptyResponse(404)
            }

            let member = book.access.find(
                candidate => candidate.emailKey === emailKey
            )
            if (member === undefined) {
                member = {
                    id: nextId("access"),
                    email: memberAccount.email,
                    emailKey,
                    accessLevel: request.body.accessLevel
                }
                book.access.push(member)
            } else {
                member.accessLevel = request.body.accessLevel
            }
            return jsonResponse(toAccessSummary(member))
        }

        if (segments.length === 4 && request.method === "DELETE") {
            const csrfError = requireAntiforgery(request)
            if (csrfError !== null) {
                return csrfError
            }
            const memberIndex = book.access.findIndex(
                member => member.id === segments[3]
            )
            if (memberIndex === -1) {
                return emptyResponse(404)
            }
            book.access.splice(memberIndex, 1)
            return emptyResponse(204)
        }

        return emptyResponse(404)
    }

    function handleSongRequest(request, account, book, segments) {
        const tail = segments.slice(3)
        if (tail.length === 0 && request.method === "GET") {
            const denial = requireBookAccess(book, account, "reader")
            if (denial !== null) {
                return denial
            }

            const rawSearch = request.query.search
            const search = typeof rawSearch === "string"
                ? rawSearch.trim()
                : ""
            if (search.length > 100) {
                return validationProblem(
                    "search",
                    "Search must contain at most 100 characters."
                )
            }

            const page = readPageNumber(request)
            if (page.error !== undefined) {
                return page.error
            }

            const tokens = foldSearch(search).split(" ").filter(Boolean)
            const songs = sortSongs(book.songs)
                .filter(song =>
                    tokens.length === 0 ||
                    tokens.every(token =>
                        [
                            song.title,
                            song.originalTitle,
                            song.author,
                            song.number
                        ].some(value => foldSearch(value).includes(token))
                    )
                )
                .map(toSongSummary)
            return pagedResponse(songs, page.value)
        }

        if (tail.length === 0 && request.method === "POST") {
            const denial = requireBookAccess(book, account, "editor")
            if (denial !== null) {
                return denial
            }
            const csrfError = requireAntiforgery(request)
            if (csrfError !== null) {
                return csrfError
            }

            const created = buildNewSong(request.body, nextId)
            if (created.error !== undefined) {
                return created.error
            }
            book.songs.push(created.song)
            markBookChanged(book)
            return jsonResponse(toSongResponse(created.song), 201, {
                Location: `/songbooks/${encodeURIComponent(book.id)}/songs/${encodeURIComponent(created.song.id)}`
            })
        }

        if (tail.length === 1 && request.method === "GET") {
            const denial = requireBookAccess(book, account, "reader")
            if (denial !== null) {
                return denial
            }
            const song = book.songs.find(candidate => candidate.id === tail[0])
            return song === undefined
                ? emptyResponse(404)
                : jsonResponse(toSongResponse(song))
        }

        if (
            tail.length === 2 &&
            tail[1] === "adjacent" &&
            request.method === "GET"
        ) {
            const denial = requireBookAccess(book, account, "reader")
            if (denial !== null) {
                return denial
            }
            const songs = sortSongs(book.songs)
            const index = songs.findIndex(song => song.id === tail[0])
            if (index === -1) {
                return emptyResponse(404)
            }
            return jsonResponse({
                previous: index > 0 ? toSongSummary(songs[index - 1]) : null,
                next: index + 1 < songs.length
                    ? toSongSummary(songs[index + 1])
                    : null
            })
        }

        if (
            tail.length === 1 &&
            (request.method === "PUT" || request.method === "DELETE")
        ) {
            const denial = requireBookAccess(book, account, "editor")
            if (denial !== null) {
                return denial
            }
            const csrfError = requireAntiforgery(request)
            if (csrfError !== null) {
                return csrfError
            }

            const songIndex = book.songs.findIndex(
                song => song.id === tail[0]
            )
            if (songIndex === -1) {
                return emptyResponse(404)
            }
            if (request.method === "DELETE") {
                book.songs.splice(songIndex, 1)
                markBookChanged(book)
                return emptyResponse(204)
            }

            const updated = buildUpdatedSong(
                request.body,
                book.songs[songIndex],
                nextId
            )
            if (updated.error !== undefined) {
                return updated.error
            }
            book.songs[songIndex] = updated.song
            markBookChanged(book)
            return emptyResponse(204)
        }

        return emptyResponse(404)
    }

    function handlePdfRequest(request, account, book, segments) {
        const accessLevel = getAccessLevel(book, account)
        if (accessLevel === null) {
            return emptyResponse(404)
        }
        const tail = segments.slice(3)

        if (tail.length === 0 && request.method === "GET") {
            const page = readPageNumber(request)
            if (page.error !== undefined) {
                return page.error
            }
            const pdfs = [...book.pdfs]
                .sort(comparePdfNewestFirst)
                .map(toPdfSummary)
            return pagedResponse(pdfs, page.value)
        }

        if (tail.length === 0 && request.method === "POST") {
            if (accessLevel !== "admin") {
                return emptyResponse(403)
            }
            const csrfError = requireAntiforgery(request)
            if (csrfError !== null) {
                return csrfError
            }
            if (typeof request.body?.includeChords !== "boolean") {
                return validationProblem(
                    "includeChords",
                    "Specify whether to include chords."
                )
            }

            const songIds = request.body.songIds
            let selectedSongs = []
            let isWholeBook = songIds === undefined || songIds === null
            if (!isWholeBook) {
                if (
                    !Array.isArray(songIds) ||
                    songIds.length === 0 ||
                    songIds.some(id =>
                        typeof id !== "string" || id.trim() === ""
                    ) ||
                    new Set(songIds).size !== songIds.length
                ) {
                    return validationProblem(
                        "songIds",
                        "Select one or more distinct songs from this book."
                    )
                }
                const selected = new Set(songIds)
                selectedSongs = sortSongs(book.songs)
                    .filter(song => selected.has(song.id))
                    .map(toPdfSelectedSong)
                if (selectedSongs.length !== songIds.length) {
                    return validationProblem(
                        "songIds",
                        "Every selected song must belong to this book."
                    )
                }
            }

            const pdf = {
                id: nextId("pdf"),
                includeChords: request.body.includeChords,
                isWholeBook,
                songCount: isWholeBook
                    ? book.songs.length
                    : selectedSongs.length,
                selectedSongs,
                generatedAtUtc: new Date().toISOString(),
                isOutdated: false
            }
            book.pdfs.unshift(pdf)
            return jsonResponse(toPdfSummary(pdf), 201, {
                Location: `/songbooks/${encodeURIComponent(book.id)}/pdfs/${encodeURIComponent(pdf.id)}/download`
            })
        }

        if (
            tail.length === 2 &&
            tail[1] === "download" &&
            request.method === "GET"
        ) {
            const pdf = book.pdfs.find(candidate => candidate.id === tail[0])
            if (pdf === undefined) {
                return emptyResponse(404)
            }
            return new Response("%PDF-1.7\n% fake SongBook export\n", {
                status: 200,
                headers: {
                    "Content-Type": "application/pdf",
                    "Content-Disposition": `attachment; filename="songbook-${book.id}-${pdf.includeChords ? "chords" : "lyrics"}-${pdf.id}.pdf"`
                }
            })
        }

        return emptyResponse(404)
    }

    function handleModerationRequest(request, account, segments) {
        if (segments.length === 2 && request.method === "GET") {
            if (!["moderator", "superuser"].includes(account.role)) {
                return emptyResponse(403)
            }
            const page = readPageNumber(request)
            if (page.error !== undefined) {
                return page.error
            }
            const users = [...accounts.values()]
                .filter(candidate => candidate.id !== account.id)
                .sort((left, right) =>
                    compareOrdinal(left.emailKey, right.emailKey) ||
                    compareOrdinal(left.id, right.id)
                )
                .map(toManagedUserSummary)
            return pagedResponse(users, page.value)
        }

        const isRoleRoute =
            segments.length === 4 && segments[3] === "role"
        const isBanRoute =
            segments.length === 4 && segments[3] === "ban"
        const isDeleteRoute = segments.length === 3
        if (
            !isRoleRoute &&
            !isBanRoute &&
            !isDeleteRoute
        ) {
            return emptyResponse(404)
        }
        if (
            (isRoleRoute && request.method !== "PUT") ||
            (isBanRoute && request.method !== "PUT") ||
            (isDeleteRoute && request.method !== "DELETE")
        ) {
            return emptyResponse(404)
        }
        if (
            isRoleRoute
                ? account.role !== "superuser"
                : !["moderator", "superuser"].includes(account.role)
        ) {
            return emptyResponse(403)
        }

        const csrfError = requireAntiforgery(request)
        if (csrfError !== null) {
            return csrfError
        }

        const target = [...accounts.values()].find(
            candidate => candidate.id === segments[2]
        )
        if (target === undefined) {
            return emptyResponse(404)
        }
        if (
            target.id === account.id ||
            target.role === "superuser" ||
            (
                account.role !== "superuser" &&
                target.role === "moderator"
            )
        ) {
            return emptyResponse(403)
        }

        if (isRoleRoute) {
            const role = request.body?.role
            if (role !== "user" && role !== "moderator") {
                return validationProblem(
                    "role",
                    "Role must be user or moderator."
                )
            }
            if (
                role === "moderator" &&
                (!target.emailConfirmed || target.isBanned)
            ) {
                return validationProblem(
                    "role",
                    "Only a confirmed, active account can become a moderator."
                )
            }
            if (target.role !== role) {
                target.role = role
                target.sessionVersion += 1
            }
            return emptyResponse(204)
        }

        if (isBanRoute) {
            if (typeof request.body?.isBanned !== "boolean") {
                return validationProblem(
                    "isBanned",
                    "A ban state is required."
                )
            }
            if (target.isBanned !== request.body.isBanned) {
                target.isBanned = request.body.isBanned
                target.sessionVersion += 1
            }
            return emptyResponse(204)
        }

        accounts.delete(target.emailKey)
        for (const book of [...books.values()]) {
            if (book.owner === target.emailKey) {
                books.delete(book.id)
            } else {
                book.access = book.access.filter(
                    member => member.emailKey !== target.emailKey
                )
            }
        }
        return emptyResponse(204)
    }

    function requireBookAccess(book, account, minimum) {
        const accessLevel = getAccessLevel(book, account)
        if (accessLevel === null) {
            return emptyResponse(404)
        }
        if (ACCESS_RANK[accessLevel] < ACCESS_RANK[minimum]) {
            return emptyResponse(403)
        }
        return null
    }

    function requireAntiforgery(request) {
        if (
            !isUnsafeMethod(request.method) ||
            request.headers["x-csrf-token"] === ANTIFORGERY_TOKEN
        ) {
            return null
        }

        return problemResponse(400, "Invalid antiforgery token.")
    }

    function requiresSongBookAntiforgery(request, segments) {
        if (!isUnsafeMethod(request.method)) {
            return false
        }
        if (segments.length === 1) {
            return request.method === "POST"
        }
        if (segments.length === 2) {
            return request.method === "PUT" || request.method === "DELETE"
        }
        if (segments.length === 3 && segments[2] === "access") {
            return request.method === "PUT"
        }
        if (segments.length === 4 && segments[2] === "access") {
            return request.method === "DELETE"
        }
        if (segments.length === 3 && segments[2] === "songs") {
            return request.method === "POST"
        }
        if (segments.length === 4 && segments[2] === "songs") {
            return request.method === "PUT" || request.method === "DELETE"
        }
        if (segments.length === 3 && segments[2] === "pdfs") {
            return request.method === "POST"
        }

        return false
    }

    return {
        seed,
        signIn,
        intercept,
        requests,
        handle
    }
}

async function normalizeRequest(value) {
    if (value === null || typeof value !== "object") {
        throw new TypeError("An API request object is required.")
    }

    const rawUrl = value.url ?? value.path ?? "/"
    const url = new URL(String(rawUrl), "https://localhost/")
    let body = value.body
    if (
        typeof value.clone === "function" &&
        typeof value.json === "function"
    ) {
        try {
            body = value.body === null
                ? null
                : await value.clone().json()
        } catch {
            body = null
        }
    } else if (typeof body === "string") {
        try {
            body = JSON.parse(body)
        } catch {
            // Keep malformed JSON distinguishable from an empty body.
        }
    }

    return {
        method: String(value.method ?? "GET").toUpperCase(),
        path: String(value.path ?? url.pathname),
        query: normalizeQuery(value.query, url.searchParams),
        body: body ?? null,
        headers: normalizeHeaders(value.headers)
    }
}

function normalizeQuery(query, fallback) {
    if (query instanceof URLSearchParams) {
        return Object.fromEntries(query.entries())
    }
    if (query !== null && typeof query === "object") {
        return Object.fromEntries(
            Object.entries(query).map(([key, value]) => [
                key,
                value === null || value === undefined
                    ? ""
                    : String(value)
            ])
        )
    }

    return Object.fromEntries(fallback.entries())
}

function normalizeHeaders(headers) {
    if (headers === null || headers === undefined) {
        return {}
    }

    const entries = typeof headers.entries === "function"
        ? headers.entries()
        : Object.entries(headers)
    return Object.fromEntries(
        [...entries].map(([name, value]) => [
            String(name).toLowerCase(),
            String(value)
        ])
    )
}

function normalizeInterceptResponse(value) {
    if (
        value !== null &&
        typeof value === "object" &&
        typeof value.status === "number" &&
        typeof value.json === "function"
    ) {
        return value
    }
    if (
        value !== null &&
        typeof value === "object" &&
        Object.hasOwn(value, "body")
    ) {
        return response(
            value.body,
            value.status ?? 200,
            value.headers ?? {},
            value.contentType
        )
    }

    return jsonResponse(value)
}

function buildSeedSong(payload, id, nextId) {
    return {
        id,
        title: payload.title ?? null,
        author: payload.author ?? null,
        originalTitle: payload.originalTitle ?? null,
        number: payload.number ?? null,
        key: payload.key ?? null,
        tempo: payload.tempo ?? null,
        parts: Array.isArray(payload.parts)
            ? payload.parts.map(part => ({
                id: part.id ?? nextId("part"),
                name: part.name ?? null,
                text: part.text ?? null,
                chords: Array.isArray(part.chords)
                    ? part.chords.map(chord => ({
                        offset: chord.offset,
                        symbol: chord.symbol
                    }))
                    : []
            }))
            : []
    }
}

function buildNewSong(payload, nextId) {
    if (payload === null || typeof payload !== "object") {
        return { error: validationProblem("parts", "A song body is required.") }
    }
    const parts = payload.parts ?? []
    if (!Array.isArray(parts)) {
        return { error: validationProblem("parts", "Parts must be an array.") }
    }
    if (parts.some(part => part !== null && part.id !== undefined && part.id !== null)) {
        return {
            error: validationProblem(
                "parts",
                "Part IDs are accepted only when updating existing parts."
            )
        }
    }

    const normalizedParts = []
    for (const part of parts) {
        if (part === null || typeof part !== "object") {
            return {
                error: validationProblem("parts", "A part cannot be null.")
            }
        }
        const chords = Array.isArray(part.chords) ? part.chords : []
        const chordError = validateChordList(part.text, chords)
        if (chordError !== null) {
            return { error: validationProblem("parts", chordError) }
        }
        normalizedParts.push({
            id: nextId("part"),
            name: part.name ?? null,
            text: part.text ?? null,
            chords: normalizeChords(chords)
        })
    }

    return {
        song: {
            id: nextId("song"),
            title: payload.title ?? null,
            author: payload.author ?? null,
            originalTitle: payload.originalTitle ?? null,
            number: payload.number ?? null,
            key: payload.key ?? null,
            tempo: payload.tempo ?? null,
            parts: normalizedParts
        }
    }
}

function buildUpdatedSong(payload, existingSong, nextId) {
    if (payload === null || typeof payload !== "object") {
        return { error: validationProblem("parts", "A song body is required.") }
    }
    const parts = payload.parts ?? []
    if (!Array.isArray(parts)) {
        return { error: validationProblem("parts", "Parts must be an array.") }
    }

    const existingParts = new Map(
        existingSong.parts.map(part => [part.id, part])
    )
    const retained = new Set()
    const normalizedParts = []

    for (const part of parts) {
        if (part === null || typeof part !== "object") {
            return {
                error: validationProblem("parts", "A part cannot be null.")
            }
        }

        let existingPart
        if (part.id !== undefined && part.id !== null) {
            existingPart = existingParts.get(String(part.id))
            if (existingPart === undefined) {
                return {
                    error: validationProblem(
                        "parts",
                        "A submitted part ID does not belong to this song."
                    )
                }
            }
            if (retained.has(existingPart.id)) {
                return {
                    error: validationProblem(
                        "parts",
                        "A part ID cannot be submitted more than once."
                    )
                }
            }
            retained.add(existingPart.id)
        }

        let chords
        if (Array.isArray(part.chords)) {
            chords = part.chords
        } else if (part.chords === undefined || part.chords === null) {
            if (
                existingPart?.chords.length > 0 &&
                (existingPart.text ?? null) !== (part.text ?? null)
            ) {
                return {
                    error: validationProblem(
                        "parts",
                        "Submit chords when changing lyrics in a part that already has chords."
                    )
                }
            }
            chords = existingPart?.chords ?? []
        } else {
            return {
                error: validationProblem("parts", "Chords must be an array.")
            }
        }

        const text = part.text ?? null
        const chordError = validateChordList(text, chords)
        if (chordError !== null) {
            return { error: validationProblem("parts", chordError) }
        }
        normalizedParts.push({
            id: existingPart?.id ?? nextId("part"),
            name: part.name ?? null,
            text,
            chords: normalizeChords(chords)
        })
    }

    return {
        song: {
            id: existingSong.id,
            title: payload.title ?? null,
            author: payload.author ?? null,
            originalTitle: payload.originalTitle ?? null,
            number: payload.number ?? null,
            key: payload.key ?? null,
            tempo: payload.tempo ?? null,
            parts: normalizedParts
        }
    }
}

function validateChordList(text, chords) {
    const lyricText = typeof text === "string" ? text : ""
    const offsets = new Set()
    for (const chord of chords) {
        if (chord === null || typeof chord !== "object") {
            return "A chord cannot be null."
        }

        const offset = chord.offset
        if (
            !Number.isInteger(offset) ||
            offset < 0 ||
            offset >= lyricText.length ||
            lyricText[offset] === "\r" ||
            lyricText[offset] === "\n" ||
            isLowSurrogate(lyricText.charCodeAt(offset)) ||
            (
                isHighSurrogate(lyricText.charCodeAt(offset)) &&
                !isLowSurrogate(lyricText.charCodeAt(offset + 1))
            )
        ) {
            return "The chord offset must point to a lyric character."
        }
        if (offsets.has(offset)) {
            return "Only one chord can be placed at each character."
        }
        offsets.add(offset)

        const symbol = typeof chord.symbol === "string"
            ? chord.symbol.trim()
            : ""
        if (symbol === "" || symbol.length > 64) {
            return "A chord symbol must be nonblank and at most 64 characters."
        }
    }

    return null
}

function normalizeChords(chords) {
    return chords.map(chord => ({
        offset: chord.offset,
        symbol: chord.symbol.trim()
    }))
}

function isHighSurrogate(codeUnit) {
    return codeUnit >= 0xd800 && codeUnit <= 0xdbff
}

function isLowSurrogate(codeUnit) {
    return codeUnit >= 0xdc00 && codeUnit <= 0xdfff
}

function makePdfMetadata(book, options, nextId) {
    const songIds = options.songIds
    const isWholeBook = options.isWholeBook ?? (
        songIds === undefined || songIds === null
    )
    const selectedIds = new Set(Array.isArray(songIds) ? songIds : [])
    const selectedSongs = options.selectedSongs ?? (
        isWholeBook
            ? []
            : sortSongs(book.songs)
                .filter(song => selectedIds.has(song.id))
                .map(toPdfSelectedSong)
    )

    return {
        id: options.id ?? nextId("pdf"),
        includeChords: Boolean(options.includeChords),
        isWholeBook,
        songCount: options.songCount ?? (
            isWholeBook ? book.songs.length : selectedSongs.length
        ),
        selectedSongs: selectedSongs.map(song => ({
            id: song.id,
            title: song.title ?? "Untitled"
        })),
        generatedAtUtc: options.generatedAtUtc ?? new Date().toISOString(),
        isOutdated: Boolean(options.isOutdated)
    }
}

function toBookSummary(book, accessLevel) {
    return {
        id: book.id,
        name: book.name,
        accessLevel,
        songCount: book.songs.length
    }
}

function toAccessSummary(member) {
    return {
        id: member.id,
        email: member.email,
        accessLevel: member.accessLevel
    }
}

function toSongSummary(song) {
    return {
        id: song.id,
        title: song.title,
        author: song.author,
        number: song.number
    }
}

function toPdfSelectedSong(song) {
    return {
        id: song.id,
        title: song.title ?? "Untitled"
    }
}

function toSongResponse(song) {
    return {
        id: song.id,
        title: song.title,
        author: song.author,
        originalTitle: song.originalTitle,
        number: song.number,
        key: song.key,
        tempo: song.tempo,
        parts: song.parts.map(part => ({
            id: part.id,
            name: part.name,
            text: part.text,
            chords: part.chords.map(chord => ({
                offset: chord.offset,
                symbol: chord.symbol
            }))
        }))
    }
}

function toPdfSummary(pdf) {
    return {
        id: pdf.id,
        includeChords: pdf.includeChords,
        isWholeBook: pdf.isWholeBook,
        songCount: pdf.songCount,
        selectedSongs: pdf.selectedSongs.map(song => ({
            id: song.id,
            title: song.title
        })),
        generatedAtUtc: pdf.generatedAtUtc,
        isOutdated: pdf.isOutdated
    }
}

function toManagedUserSummary(account) {
    return {
        id: account.id,
        email: account.email,
        role: account.role,
        isBanned: account.isBanned,
        emailConfirmed: account.emailConfirmed
    }
}

function sortSongs(songs) {
    return [...songs].sort((left, right) =>
        compareNullableOrdinal(left.title, right.title) ||
        compareOrdinal(left.id, right.id)
    )
}

function compareNullableOrdinal(left, right) {
    if (left === right) {
        return 0
    }
    if (left === null || left === undefined) {
        return -1
    }
    if (right === null || right === undefined) {
        return 1
    }
    return compareOrdinal(left, right)
}

function compareOrdinal(left, right) {
    if (left === right) {
        return 0
    }
    return left < right ? -1 : 1
}

function comparePdfNewestFirst(left, right) {
    const timeDifference =
        Date.parse(right.generatedAtUtc) - Date.parse(left.generatedAtUtc)
    if (Number.isFinite(timeDifference) && timeDifference !== 0) {
        return timeDifference
    }

    return compareOrdinal(right.id, left.id)
}

function foldSearch(value) {
    return String(value ?? "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/\p{Mn}/gu, "")
        .replace(/ł/g, "l")
        .replace(/\s+/g, " ")
        .trim()
}

function normalizeEmail(value) {
    return String(value ?? "").trim().toLowerCase()
}

function isValidEmail(value) {
    return typeof value === "string" &&
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}

function readBookName(body) {
    if (body === null || typeof body !== "object" || typeof body.name !== "string") {
        return {
            error: validationProblem("name", "A song-book name is required.")
        }
    }
    const name = body.name.trim()
    if (name.length === 0 || name.length > 100) {
        return {
            error: validationProblem(
                "name",
                "The song-book name must contain 1 to 100 characters."
            )
        }
    }
    return { value: name }
}

function readPageNumber(request) {
    const rawPage = request.query.page ?? "1"
    if (!/^\d+$/.test(String(rawPage))) {
        return {
            error: validationProblem("page", "Page must be a positive integer.")
        }
    }

    const page = Number(rawPage)
    if (
        !Number.isSafeInteger(page) ||
        page < 1 ||
        !Number.isSafeInteger((page - 1) * PAGE_SIZE)
    ) {
        return {
            error: validationProblem("page", "Page must be a positive integer.")
        }
    }

    return { value: page }
}

function pagedResponse(items, page) {
    const offset = (page - 1) * PAGE_SIZE
    return jsonResponse({
        items: items.slice(offset, offset + PAGE_SIZE),
        page,
        hasNext: items.length > offset + PAGE_SIZE
    })
}

function isUnsafeMethod(method) {
    return !["GET", "HEAD", "OPTIONS", "TRACE"].includes(method)
}

function validationProblem(key, message) {
    return jsonResponse({
        title: "One or more validation errors occurred.",
        errors: { [key]: [message] }
    }, 400, {}, "application/problem+json")
}

function problemResponse(status, title) {
    return jsonResponse({ title, status }, status, {}, "application/problem+json")
}

function jsonResponse(body, status = 200, headers = {}, contentType = "application/json") {
    const responseHeaders = new Headers(headers)
    responseHeaders.set("Content-Type", contentType)
    return new Response(JSON.stringify(body), {
        status,
        headers: responseHeaders
    })
}

function emptyResponse(status, headers = {}) {
    return new Response(null, { status, headers })
}

function response(body, status = 200, headers = {}, contentType) {
    if (body === undefined || body === null || [204, 205, 304].includes(status)) {
        return emptyResponse(status, headers)
    }
    if (
        typeof body !== "string" &&
        !(body instanceof Uint8Array) &&
        !(typeof Blob !== "undefined" && body instanceof Blob)
    ) {
        return jsonResponse(body, status, headers, contentType)
    }

    const responseHeaders = new Headers(headers)
    if (contentType !== undefined) {
        responseHeaders.set("Content-Type", contentType)
    }
    return new Response(body, {
        status,
        headers: responseHeaders
    })
}
