import {
    createSong,
    deleteSong,
    getSong,
    getSongs,
    updateSong
} from "./songsApi.js"
import {
    createSongBook,
    createSongBookPdf,
    deleteSongBook,
    downloadSongBookPdf,
    getSongBook,
    getSongBookAccess,
    getSongBookPdfs,
    getSongBooks,
    removeSongBookAccess,
    renameSongBook,
    setSongBookAccess
} from "./songBooksApi.js"
import {
    getCurrentUser,
    login,
    logout,
    registerAccount,
    requestPasswordReset,
    resendConfirmation,
    resetPassword
} from "./authApi.js"
import {
    ApiError,
    resetAntiforgeryToken
} from "./httpClient.js"
import {
    deleteManagedUser,
    getManagedUsers,
    setManagedUserBan,
    setManagedUserRole
} from "./moderationApi.js"
import {
    buildSongPayload,
    createPartDraft,
    populateSongForm,
    renderChordEditor,
    renderPartsEditor
} from "./songForm.js"
import {
    adjustChordsForTextEdit,
    isChordAnchor,
    renderChordedText
} from "./chords.js"
import {
    fetchAvailablePage,
    readPage,
    renderPageControls
} from "./pagination.js"

export const state = {
    songBooks: [],
    songBookPage: 1,
    songBookHasNext: false,
    selectedSongBookId: null,
    selectedSongBook: null,
    selectedSongBookAccessLevel: null,
    songBookMembers: [],
    memberPage: 1,
    memberHasNext: false,
    songBookFormMode: "idle",
    isLoadingSongBooks: false,
    isLoadingSongBook: false,
    isSavingSongBook: false,
    isLoadingSongBookMembers: false,
    isSavingSongBookAccess: false,
    songBookPdfs: [],
    pdfPage: 1,
    pdfHasNext: false,
    pdfScope: "whole",
    pdfSelectedSongs: new Map(),
    isLoadingPdfs: false,
    isGeneratingPdf: false,
    downloadingPdfId: null,
    songs: [],
    songPage: 1,
    songHasNext: false,
    selectedSongId: null,
    selectedSong: null,
    showChords: true,
    editorMode: "idle",
    isLoadingSongs: false,
    isLoadingSong: false,
    isSaving: false,
    deletingSongId: null,
    draftParts: [],
    notice: null,
    auth: {
        status: "loading",
        email: null,
        role: null
    },
    authView: "none",
    isAuthPending: false,
    managedUsers: [],
    managedUserPage: 1,
    managedUserHasNext: false,
    showUserManagement: false,
    isLoadingManagedUsers: false,
    mutatingManagedUserId: null
}

const NOTICE_TYPES = new Set(["info", "success", "error"])
let collectionLoadFailed = false
let songBookListLoadFailed = false
let songBookMembersLoadFailed = false
let pdfListLoadFailed = false
let authLoadFailed = false
let resetPasswordCredentials = null
let authPanelTrigger = null
let preservedSongDraft = null
let authGeneration = 0
let songBookListRequestId = 0
let songBookSelectionRequestId = 0
let songCollectionRequestId = 0
let songDetailRequestId = 0
let songDetailController = null
let songBookMembersRequestId = 0
let songBookAccessMutationId = 0
let pdfListRequestId = 0
let pdfMutationId = 0
let pdfDownloadRequestId = 0
let songBookMutationId = 0
let songMutationId = 0
let managedUserListRequestId = 0
let managedUserMutationId = 0
let managedUserListLoadFailed = false
let renderedBooks = null
let renderedBookSelection = null
let renderedBookBusy = null
let bookRows = new Map()
let renderedSongs = null
let renderedSongWriteAccess = null
let renderedSongPdfMode = null
let renderedSongSelection = null
let renderedSongSaving = null
let renderedSongDeletion = null
let songRows = new Map()
let renderedPdfs = null
let renderedUsers = null
let renderedUserRole = null
let renderedUserPanel = null
let renderedUserBusy = null

const elements = {
    songActions: document.getElementById("song-actions"),
    songBooksPanel: document.getElementById("song-books-panel"),
    songBookContent: document.getElementById("song-book-content"),
    manageUsersButton: document.getElementById("manage-users-button"),
    moderationPanel: document.getElementById("moderation-panel"),
    moderationHeading: document.getElementById("moderation-heading"),
    closeModerationButton: document.getElementById(
        "close-moderation-button"
    ),
    refreshManagedUsersButton: document.getElementById(
        "refresh-managed-users-button"
    ),
    moderationListState: document.getElementById(
        "moderation-list-state"
    ),
    moderationList: document.getElementById("moderation-list"),
    userPagination: {
        container: document.getElementById("user-pagination"),
        previous: document.getElementById("previous-user-page-button"),
        next: document.getElementById("next-user-page-button"),
        status: document.getElementById("user-page-status")
    },
    newSongBookButton: document.getElementById("new-song-book-button"),
    refreshSongBooksButton: document.getElementById(
        "refresh-song-books-button"
    ),
    songBookListHeading: document.getElementById(
        "song-book-list-heading"
    ),
    songBookListState: document.getElementById("song-book-list-state"),
    songBookList: document.getElementById("song-book-list"),
    bookPagination: {
        container: document.getElementById("song-book-pagination"),
        previous: document.getElementById(
            "previous-song-book-page-button"
        ),
        next: document.getElementById("next-song-book-page-button"),
        status: document.getElementById("song-book-page-status")
    },
    songBookForm: document.getElementById("song-book-form"),
    songBookFormHeading: document.getElementById(
        "song-book-form-heading"
    ),
    songBookName: document.getElementById("song-book-name"),
    cancelSongBookButton: document.getElementById(
        "cancel-song-book-button"
    ),
    saveSongBookButton: document.getElementById(
        "save-song-book-button"
    ),
    selectedSongBookPanel: document.getElementById(
        "selected-song-book-panel"
    ),
    selectedSongBookHeading: document.getElementById(
        "selected-song-book-heading"
    ),
    renameSongBookButton: document.getElementById(
        "rename-song-book-button"
    ),
    deleteSongBookButton: document.getElementById(
        "delete-song-book-button"
    ),
    songBookPdfsPanel: document.getElementById(
        "song-book-pdfs-panel"
    ),
    refreshSongBookPdfsButton: document.getElementById(
        "refresh-song-book-pdfs-button"
    ),
    songBookPdfsState: document.getElementById(
        "song-book-pdfs-state"
    ),
    songBookPdfsList: document.getElementById(
        "song-book-pdfs-list"
    ),
    pdfPagination: {
        container: document.getElementById("pdf-pagination"),
        previous: document.getElementById("previous-pdf-page-button"),
        next: document.getElementById("next-pdf-page-button"),
        status: document.getElementById("pdf-page-status")
    },
    songBookPdfForm: document.getElementById("song-book-pdf-form"),
    songBookPdfScope: document.getElementById(
        "song-book-pdf-scope"
    ),
    songBookPdfSelectionState: document.getElementById(
        "song-book-pdf-selection-state"
    ),
    songBookPdfIncludeChords: document.getElementById(
        "song-book-pdf-include-chords"
    ),
    songBookAccessPanel: document.getElementById(
        "song-book-access-panel"
    ),
    songBookAccessState: document.getElementById(
        "song-book-access-state"
    ),
    songBookAccessList: document.getElementById(
        "song-book-access-list"
    ),
    memberPagination: {
        container: document.getElementById("member-pagination"),
        previous: document.getElementById("previous-member-page-button"),
        next: document.getElementById("next-member-page-button"),
        status: document.getElementById("member-page-status")
    },
    songBookAccessForm: document.getElementById(
        "song-book-access-form"
    ),
    songBookAccessEmail: document.getElementById(
        "song-book-access-email"
    ),
    songBookAccessLevel: document.getElementById(
        "song-book-access-level"
    ),
    saveSongBookAccessButton: document.getElementById(
        "save-song-book-access-button"
    ),
    newSongButton: document.getElementById("new-song-button"),
    refreshSongsButton: document.getElementById("refresh-songs-button"),
    appStatus: document.getElementById("app-status"),
    songListHeading: document.getElementById("song-list-heading"),
    songListState: document.getElementById("song-list-state"),
    songList: document.getElementById("song-list"),
    songPagination: {
        container: document.getElementById("song-pagination"),
        previous: document.getElementById("previous-song-page-button"),
        next: document.getElementById("next-song-page-button"),
        status: document.getElementById("song-page-status")
    },
    songDetails: document.getElementById("song-details"),
    songForm: document.getElementById("song-form"),
    songFormHeading: document.getElementById("song-form-heading"),
    songTitle: document.getElementById("song-title"),
    songAuthor: document.getElementById("song-author"),
    songOriginalTitle: document.getElementById("song-original-title"),
    songNumber: document.getElementById("song-number"),
    songKey: document.getElementById("song-key"),
    songTempo: document.getElementById("song-tempo"),
    partsEditor: document.getElementById("parts-editor"),
    addPartButton: document.getElementById("add-part-button"),
    songFormStatus: document.getElementById("song-form-status"),
    cancelSongButton: document.getElementById("cancel-song-button"),
    saveSongButton: document.getElementById("save-song-button"),
    authSummary: document.getElementById("auth-summary"),
    showLoginButton: document.getElementById("show-login-button"),
    showRegisterButton: document.getElementById("show-register-button"),
    logoutButton: document.getElementById("logout-button"),
    authPanel: document.getElementById("auth-panel"),
    authPanelHeading: document.getElementById("auth-panel-heading"),
    closeAuthPanelButton: document.getElementById(
        "close-auth-panel-button"
    ),
    loginForm: document.getElementById("login-form"),
    loginEmail: document.getElementById("login-email"),
    loginPassword: document.getElementById("login-password"),
    loginRememberMe: document.getElementById("login-remember-me"),
    registerForm: document.getElementById("register-form"),
    registerEmail: document.getElementById("register-email"),
    registerPassword: document.getElementById("register-password"),
    registerConfirmPassword: document.getElementById(
        "register-confirm-password"
    ),
    resendConfirmationForm: document.getElementById(
        "resend-confirmation-form"
    ),
    resendConfirmationEmail: document.getElementById(
        "resend-confirmation-email"
    ),
    forgotPasswordForm: document.getElementById("forgot-password-form"),
    forgotPasswordEmail: document.getElementById(
        "forgot-password-email"
    ),
    resetPasswordForm: document.getElementById("reset-password-form"),
    resetPasswordEmail: document.getElementById("reset-password-email"),
    resetPasswordNewPassword: document.getElementById(
        "reset-password-new-password"
    ),
    resetPasswordConfirmPassword: document.getElementById(
        "reset-password-confirm-password"
    ),
    showResendConfirmationButton: document.getElementById(
        "show-resend-confirmation-button"
    ),
    showForgotPasswordButton: document.getElementById(
        "show-forgot-password-button"
    ),
    writeAccessMessage: document.getElementById("write-access-message")
}

elements.newSongBookButton.addEventListener("click", beginCreateSongBook)
elements.refreshSongBooksButton.addEventListener(
    "click",
    () => loadSongBooks()
)
elements.bookPagination.previous.addEventListener(
    "click",
    () => loadSongBooks({
        page: state.songBookPage - 1,
        showSuccessNotice: false,
        refreshMembers: false
    })
)
elements.bookPagination.next.addEventListener(
    "click",
    () => loadSongBooks({
        page: state.songBookPage + 1,
        showSuccessNotice: false,
        refreshMembers: false
    })
)
elements.manageUsersButton.addEventListener(
    "click",
    openUserManagement
)
elements.closeModerationButton.addEventListener(
    "click",
    closeUserManagement
)
elements.refreshManagedUsersButton.addEventListener(
    "click",
    loadManagedUsers
)
elements.userPagination.previous.addEventListener(
    "click",
    () => loadManagedUsers({ page: state.managedUserPage - 1 })
)
elements.userPagination.next.addEventListener(
    "click",
    () => loadManagedUsers({ page: state.managedUserPage + 1 })
)
elements.moderationList.addEventListener(
    "click",
    handleManagedUserAction
)
elements.songBookForm.addEventListener("submit", saveSongBook)
elements.cancelSongBookButton.addEventListener(
    "click",
    cancelSongBookEditor
)
elements.renameSongBookButton.addEventListener(
    "click",
    beginRenameSongBook
)
elements.deleteSongBookButton.addEventListener(
    "click",
    requestSongBookDeletion
)
elements.refreshSongBookPdfsButton.addEventListener(
    "click",
    () => loadSongBookPdfs({
        showErrorNotice: true,
        showSuccessNotice: true
    })
)
elements.pdfPagination.previous.addEventListener(
    "click",
    () => loadSongBookPdfs({
        page: state.pdfPage - 1,
        showErrorNotice: true
    })
)
elements.pdfPagination.next.addEventListener(
    "click",
    () => loadSongBookPdfs({
        page: state.pdfPage + 1,
        showErrorNotice: true
    })
)
elements.songBookPdfForm.addEventListener(
    "submit",
    generateSongBookPdf
)
elements.songBookPdfScope.addEventListener("change", event => {
    if (!isSongBookAdmin()) {
        return
    }

    state.pdfScope = event.currentTarget.value === "selected"
        ? "selected"
        : "whole"
    renderSongBookPdfs()
    renderSongList()
})
elements.songBookPdfsList.addEventListener("click", event => {
    if (event.target.dataset?.action === "download-pdf") {
        return downloadPdf(event.target.dataset.pdfId)
    }
})
elements.songBookAccessForm.addEventListener(
    "submit",
    saveSongBookMember
)
elements.songBookAccessList.addEventListener("click", async event => {
    const action = event.target.dataset?.action
    const accessId = event.target.dataset?.accessId

    if (action === "edit-song-book-access") {
        beginEditSongBookMember(accessId)
    }

    if (action === "remove-song-book-access") {
        await requestSongBookMemberRemoval(accessId, event.target)
    }
})
elements.memberPagination.previous.addEventListener(
    "click",
    () => loadSongBookMembers({
        page: state.memberPage - 1,
        showErrorNotice: true
    })
)
elements.memberPagination.next.addEventListener(
    "click",
    () => loadSongBookMembers({
        page: state.memberPage + 1,
        showErrorNotice: true
    })
)
elements.newSongButton.addEventListener("click", beginCreateSong)
elements.refreshSongsButton.addEventListener(
    "click",
    () => loadSongs()
)
elements.songPagination.previous.addEventListener(
    "click",
    () => loadSongs({
        page: state.songPage - 1,
        showSuccessNotice: false
    })
)
elements.songPagination.next.addEventListener(
    "click",
    () => loadSongs({
        page: state.songPage + 1,
        showSuccessNotice: false
    })
)
elements.songList.addEventListener("click", async event => {
    const songId = event.target.dataset?.songId
    const action = event.target.dataset?.action

    if (songId === undefined || action === undefined) {
        return
    }

    if (action === "view-song") {
        await selectSong(songId, {
            focusDetails: true
        })
    }

    if (action === "delete-song") {
        await requestSongDeletion(songId, event.target)
    }
})
elements.songList.addEventListener("change", event => {
    if (
        event.target.dataset?.action !== "select-pdf-song" ||
        !isSongBookAdmin() ||
        state.pdfScope !== "selected" ||
        event.target.disabled ||
        state.isGeneratingPdf ||
        state.isSaving ||
        state.deletingSongId !== null
    ) {
        return
    }

    const songId = event.target.dataset.songId
    const song = songRows.get(songId)?.song
    if (song === undefined) {
        return
    }

    if (event.target.checked) {
        state.pdfSelectedSongs.set(
            songId,
            displayValue(song.title, "Untitled song")
        )
    } else {
        state.pdfSelectedSongs.delete(songId)
    }
    renderPdfControls()
})
elements.songForm.addEventListener("submit", saveSong)
elements.addPartButton.addEventListener("click", addPart)
elements.cancelSongButton.addEventListener("click", cancelSongEditor)
elements.partsEditor.addEventListener("input", updatePartDraft)
elements.partsEditor.addEventListener("beforeinput", rememberPartTextEdit)
elements.partsEditor.addEventListener("keyup", updateChordCursor)
elements.partsEditor.addEventListener("select", updateChordCursor)
elements.partsEditor.addEventListener("keydown", handleChordKeydown)
elements.partsEditor.addEventListener("click", handlePartAction)
elements.showLoginButton.addEventListener(
    "click",
    event => openAuthView("login", event.currentTarget)
)
elements.showRegisterButton.addEventListener(
    "click",
    event => openAuthView("register", event.currentTarget)
)
elements.logoutButton.addEventListener("click", handleLogout)
elements.closeAuthPanelButton.addEventListener(
    "click",
    closeAuthView
)
elements.showResendConfirmationButton.addEventListener(
    "click",
    event => openAuthView(
        "resend-confirmation",
        event.currentTarget
    )
)
elements.showForgotPasswordButton.addEventListener(
    "click",
    event => openAuthView("forgot-password", event.currentTarget)
)
elements.loginForm.addEventListener("submit", handleLogin)
elements.registerForm.addEventListener("submit", handleRegistration)
elements.resendConfirmationForm.addEventListener(
    "submit",
    handleResendConfirmation
)
elements.forgotPasswordForm.addEventListener(
    "submit",
    handleForgotPassword
)
elements.resetPasswordForm.addEventListener(
    "submit",
    handleResetPassword
)

export function setNotice(type, message = "") {
    if (type === null) {
        state.notice = null
        return
    }

    if (!NOTICE_TYPES.has(type)) {
        throw new TypeError(`Unsupported notice type: ${type}`)
    }

    state.notice = {
        type,
        message: String(message)
    }
}

export async function loadAuthState() {
    const requestGeneration = ++authGeneration
    state.auth.status = "loading"
    state.auth.email = null
    state.auth.role = null
    authLoadFailed = false
    clearUserManagement()
    renderUserManagement()
    renderAuth()

    try {
        const currentUser = await getCurrentUser()

        if (requestGeneration !== authGeneration) {
            return false
        }

        const isAuthenticated =
            currentUser?.isAuthenticated === true
        state.auth.status = isAuthenticated
            ? "authenticated"
            : "anonymous"
        state.auth.email = isAuthenticated &&
            typeof currentUser.email === "string"
            ? currentUser.email
            : null
        state.auth.role = isAuthenticated &&
            ["user", "moderator", "superuser"].includes(currentUser.role)
            ? currentUser.role
            : null

        if (!isAuthenticated) {
            clearPrivateState()
        }

        return true
    } catch {
        if (requestGeneration !== authGeneration) {
            return false
        }

        state.auth.status = "anonymous"
        state.auth.email = null
        state.auth.role = null
        authLoadFailed = true

        clearPrivateState()

        return false
    } finally {
        if (requestGeneration === authGeneration) {
            renderAuth()
            renderUserManagement()
            renderSongBookList()
            renderSongBookState()
            renderSelectedSongBook()
            renderSongBookMembers()
            renderSongList()
            renderCollectionState()
            renderSongDetails()
            renderMutationControls()
        }
    }
}

export function openAuthView(view, trigger = null) {
    if (
        state.isAuthPending ||
        ![
            "login",
            "register",
            "resend-confirmation",
            "forgot-password",
            "reset-password"
        ].includes(view)
    ) {
        return false
    }

    state.authView = view
    authPanelTrigger = trigger
    renderAuth()
    focusAuthView(view)
    return true
}

export function closeAuthView() {
    if (state.isAuthPending) {
        return false
    }

    const focusTarget = authPanelTrigger
    state.authView = "none"
    authPanelTrigger = null
    renderAuth()
    focusTarget?.focus()
    return true
}

async function handleLogin(event) {
    event.preventDefault()

    if (
        state.isAuthPending ||
        !elements.loginForm.checkValidity()
    ) {
        elements.loginForm.reportValidity()
        return false
    }

    return runAuthAction(async () => {
        try {
            await login({
                email: elements.loginEmail.value,
                password: elements.loginPassword.value,
                rememberMe: elements.loginRememberMe.checked === true
            })
        } catch {
            setNotice(
                "error",
                "Sign-in failed. Check your credentials or use " +
                    "the confirmation and password recovery options."
            )
            renderNotice()
            elements.loginPassword.focus()
            return false
        }

        elements.loginPassword.value = ""
        resetAntiforgeryToken()
        await loadAuthState()

        if (state.auth.status !== "authenticated") {
            setNotice(
                "error",
                "The session could not be verified. Please sign in again."
            )
            renderNotice()
            return false
        }

        const booksLoaded = await loadSongBooks({
            showSuccessNotice: false
        })
        state.authView = "none"
        authPanelTrigger = null
        const draftRestored = booksLoaded &&
            await restorePreservedSongDraft()
        setNotice(
            "success",
            draftRestored
                ? "Signed in. Your unsaved song draft was restored."
                : "Signed in."
        )
        renderAuth()
        renderNotice()

        if (!draftRestored) {
            focusAfterLogin()
        }

        return true
    })
}

async function handleRegistration(event) {
    event.preventDefault()

    if (
        state.isAuthPending ||
        !elements.registerForm.checkValidity()
    ) {
        elements.registerForm.reportValidity()
        return false
    }

    if (
        elements.registerPassword.value !==
        elements.registerConfirmPassword.value
    ) {
        setNotice("error", "The passwords do not match.")
        renderNotice()
        elements.registerConfirmPassword.focus()
        return false
    }

    return runAuthAction(async () => {
        try {
            await registerAccount({
                email: elements.registerEmail.value,
                password: elements.registerPassword.value
            })
        } catch (error) {
            setNotice(
                "error",
                getAuthValidationMessage(
                    error,
                    "Registration could not be completed."
                )
            )
            renderNotice()
            return false
        }

        elements.registerPassword.value = ""
        elements.registerConfirmPassword.value = ""
        state.authView = "none"
        setNotice(
            "success",
            "Registration received. Use the confirmation link sent " +
                "by email before signing in."
        )
        renderAuth()
        renderNotice()
        elements.showLoginButton.focus()
        return true
    })
}

async function handleResendConfirmation(event) {
    event.preventDefault()

    if (
        state.isAuthPending ||
        !elements.resendConfirmationForm.checkValidity()
    ) {
        elements.resendConfirmationForm.reportValidity()
        return false
    }

    return runAuthAction(async () => {
        try {
            await resendConfirmation(
                elements.resendConfirmationEmail.value
            )
        } catch {
            setNotice(
                "error",
                "The request could not be completed. Try again later."
            )
            renderNotice()
            return false
        }

        setNotice(
            "success",
            "If the account is eligible, an email was sent."
        )
        renderNotice()
        return true
    })
}

async function handleForgotPassword(event) {
    event.preventDefault()

    if (
        state.isAuthPending ||
        !elements.forgotPasswordForm.checkValidity()
    ) {
        elements.forgotPasswordForm.reportValidity()
        return false
    }

    return runAuthAction(async () => {
        try {
            await requestPasswordReset(
                elements.forgotPasswordEmail.value
            )
        } catch {
            setNotice(
                "error",
                "The request could not be completed. Try again later."
            )
            renderNotice()
            return false
        }

        setNotice(
            "success",
            "If the account is eligible, an email was sent."
        )
        renderNotice()
        return true
    })
}

async function handleResetPassword(event) {
    event.preventDefault()

    if (
        state.isAuthPending ||
        resetPasswordCredentials === null ||
        !elements.resetPasswordForm.checkValidity()
    ) {
        elements.resetPasswordForm.reportValidity()
        return false
    }

    if (
        elements.resetPasswordNewPassword.value !==
        elements.resetPasswordConfirmPassword.value
    ) {
        setNotice("error", "The passwords do not match.")
        renderNotice()
        elements.resetPasswordConfirmPassword.focus()
        return false
    }

    return runAuthAction(async () => {
        const resetEmail = resetPasswordCredentials.email

        try {
            await resetPassword({
                email: resetEmail,
                code: resetPasswordCredentials.code,
                newPassword: elements.resetPasswordNewPassword.value
            })
        } catch (error) {
            setNotice(
                "error",
                getAuthValidationMessage(
                    error,
                    "The reset link is invalid or expired, or the " +
                        "new password is not accepted."
                )
            )
            renderNotice()
            return false
        }

        resetPasswordCredentials = null
        elements.resetPasswordEmail.value = ""
        elements.resetPasswordNewPassword.value = ""
        elements.resetPasswordConfirmPassword.value = ""
        elements.loginEmail.value = resetEmail
        state.authView = "login"
        setNotice(
            "success",
            "Password reset. Sign in with the new password."
        )
        renderAuth()
        renderNotice()
        elements.loginPassword.focus()
        return true
    })
}

async function handleLogout() {
    if (state.isAuthPending) {
        return false
    }

    return runAuthAction(async () => {
        try {
            await logout()
        } catch (error) {
            if (!(error instanceof ApiError && error.status === 401)) {
                setNotice(
                    "error",
                    "Sign-out could not be completed. Try again."
                )
                renderNotice()
                return false
            }
        }

        preservedSongDraft = null
        resetAntiforgeryToken()
        await loadAuthState()
        setNotice("success", "Signed out.")
        renderNotice()
        elements.showLoginButton.focus()
        return true
    })
}

async function runAuthAction(action) {
    state.isAuthPending = true
    renderAuth()

    try {
        return await action()
    } finally {
        state.isAuthPending = false
        renderAuth()
    }
}

export async function openUserManagement() {
    if (!canModerateUsers() || state.showUserManagement) {
        return false
    }

    state.showUserManagement = true
    setNotice(null)
    renderAuth()
    renderUserManagement()
    renderNotice()
    elements.moderationHeading.focus()
    return loadManagedUsers()
}

export function closeUserManagement() {
    if (
        !state.showUserManagement ||
        state.mutatingManagedUserId !== null
    ) {
        return false
    }

    clearUserManagement()
    renderAuth()
    renderUserManagement()
    elements.manageUsersButton.focus()
    return true
}

export async function loadManagedUsers({
    page = state.managedUserPage
} = {}) {
    if (
        !canModerateUsers() ||
        !state.showUserManagement ||
        state.isLoadingManagedUsers ||
        state.mutatingManagedUserId !== null
    ) {
        return false
    }

    const requestId = ++managedUserListRequestId
    const requestAuthGeneration = authGeneration
    state.isLoadingManagedUsers = true
    managedUserListLoadFailed = false
    renderUserManagement()

    try {
        const usersPage = await fetchAvailablePage(getManagedUsers, page)
        if (
            requestId !== managedUserListRequestId ||
            requestAuthGeneration !== authGeneration
        ) {
            return false
        }

        state.managedUsers = readManagedUsers(usersPage.items)
        state.managedUserPage = usersPage.page
        state.managedUserHasNext = usersPage.hasNext
        return true
    } catch (error) {
        if (
            requestId !== managedUserListRequestId ||
            requestAuthGeneration !== authGeneration
        ) {
            return false
        }

        if (await handleAuthenticationFailure(error)) {
            return false
        }

        if (error instanceof ApiError && error.status === 403) {
            await loadAuthState()
        } else {
            console.error(error)
        }

        state.managedUsers = []
        managedUserListLoadFailed = true
        setNotice(
            "error",
            "Users could not be loaded. Check your access and try again."
        )
        renderNotice()
        return false
    } finally {
        if (requestId === managedUserListRequestId) {
            state.isLoadingManagedUsers = false
            renderUserManagement()
            renderNotice()
        }
    }
}

async function handleManagedUserAction(event) {
    const action = event.target.dataset?.action
    const userId = event.target.dataset?.userId
    const user = state.managedUsers.find(
        candidate => candidate.id === userId
    )
    const canManageTarget =
        user?.role !== "superuser" &&
        (
            state.auth.role === "superuser" ||
            user?.role === "user"
        )
    const canChangeRole =
        state.auth.role === "superuser" &&
        user?.role !== "superuser"
    const isRoleAction = [
        "grant-moderator",
        "remove-moderator"
    ].includes(action)

    if (
        !state.showUserManagement ||
        !canModerateUsers() ||
        state.isLoadingManagedUsers ||
        state.mutatingManagedUserId !== null ||
        user === undefined ||
        !canManageTarget ||
        (
            isRoleAction
                ? !canChangeRole ||
                    (
                        action === "grant-moderator" &&
                        (user.isBanned || !user.emailConfirmed)
                    )
                : !["ban-user", "unban-user", "delete-user"].includes(
                    action
                )
        )
    ) {
        return false
    }

    const email = displayValue(user.email, "this account")
    const confirmations = {
        "grant-moderator":
            `Allow ${email} to ban and delete other users?`,
        "remove-moderator":
            `Remove Moderator access from ${email}?`,
        "ban-user":
            `Ban ${email}? Their active sessions will end.`,
        "delete-user":
            `Permanently delete ${email} and all of their song books ` +
                "and songs? This cannot be undone."
    }

    if (
        confirmations[action] !== undefined &&
        !window.confirm(confirmations[action])
    ) {
        event.target.focus()
        return false
    }

    const mutationId = ++managedUserMutationId
    const requestAuthGeneration = authGeneration
    state.mutatingManagedUserId = userId
    setNotice("info", "Updating account...")
    renderUserManagement()
    renderNotice()

    try {
        if (action === "delete-user") {
            await deleteManagedUser(userId)
        } else if (isRoleAction) {
            await setManagedUserRole(
                userId,
                action === "grant-moderator" ? "moderator" : "user"
            )
        } else {
            await setManagedUserBan(userId, action === "ban-user")
        }

        if (
            mutationId !== managedUserMutationId ||
            requestAuthGeneration !== authGeneration
        ) {
            return false
        }

        const messages = {
            "grant-moderator": "Moderator access granted.",
            "remove-moderator": "Moderator access removed.",
            "ban-user": "Account banned.",
            "unban-user": "Account unbanned.",
            "delete-user": "Account and its song books deleted."
        }

        try {
            const usersPage = await fetchAvailablePage(
                getManagedUsers,
                state.managedUserPage
            )
            if (
                mutationId !== managedUserMutationId ||
                requestAuthGeneration !== authGeneration
            ) {
                return false
            }

            state.managedUsers = readManagedUsers(usersPage.items)
            state.managedUserPage = usersPage.page
            state.managedUserHasNext = usersPage.hasNext
            managedUserListLoadFailed = false
            setNotice("success", messages[action])
        } catch (error) {
            if (
                mutationId !== managedUserMutationId ||
                requestAuthGeneration !== authGeneration
            ) {
                return false
            }

            if (await handleAuthenticationFailure(error)) {
                return false
            }

            if (error instanceof ApiError && error.status === 403) {
                await loadAuthState()
            } else {
                console.error(error)
            }
            state.managedUsers = []
            managedUserListLoadFailed = true
            setNotice(
                "error",
                `${messages[action]} The user list could not be refreshed.`
            )
            renderNotice()
        }

        return true
    } catch (error) {
        if (
            mutationId !== managedUserMutationId ||
            requestAuthGeneration !== authGeneration
        ) {
            return false
        }

        if (await handleAuthenticationFailure(error)) {
            return false
        }

        if (error instanceof ApiError && error.status === 403) {
            await loadAuthState()
            setNotice(
                "error",
                "You cannot manage this account. Access may have changed."
            )
        } else if (error instanceof ApiError && error.status === 404) {
            state.managedUsers = state.managedUsers.filter(
                candidate => candidate.id !== userId
            )
            setNotice(
                "error",
                "This account no longer exists. Refresh users."
            )
        } else {
            console.error(error)
            const detail = error instanceof ApiError &&
                error.status === 400
                ? getSafeApiDetail(error)
                : null
            setNotice(
                "error",
                detail === null
                    ? "The account could not be updated. Try again."
                    : `The account could not be updated. ${toSentence(
                        detail
                    )}`
            )
        }

        renderNotice()
        return false
    } finally {
        if (mutationId === managedUserMutationId) {
            state.mutatingManagedUserId = null
            renderUserManagement()
            renderNotice()

            if (state.showUserManagement) {
                const nextButton = findDescendant(
                    elements.moderationList,
                    element => element.dataset?.userId === userId
                )
                const focusTarget =
                    nextButton ?? elements.moderationHeading
                focusTarget.focus()
            }
        }
    }
}

function readManagedUsers(value) {
    if (!Array.isArray(value) || !value.every(user =>
        user !== null &&
        typeof user === "object" &&
        typeof user.id === "string" &&
        user.id.trim() !== "" &&
        (user.email === null || typeof user.email === "string") &&
        ["user", "moderator", "superuser"].includes(user.role) &&
        typeof user.isBanned === "boolean" &&
        typeof user.emailConfirmed === "boolean"
    )) {
        throw new ApiError("The API returned an invalid user list.")
    }

    return value
}

function clearUserManagement() {
    managedUserListRequestId += 1
    managedUserMutationId += 1
    managedUserListLoadFailed = false
    state.managedUsers = []
    state.managedUserPage = 1
    state.managedUserHasNext = false
    state.showUserManagement = false
    state.isLoadingManagedUsers = false
    state.mutatingManagedUserId = null
}

export async function loadSongBooks({
    showSuccessNotice = true,
    selectSongBookId = null,
    page = state.songBookPage,
    refreshMembers = true
} = {}) {
    if (
        !isAuthenticated() ||
        state.isLoadingSongBooks ||
        state.isSaving ||
        state.deletingSongId !== null ||
        state.isSavingSongBookAccess
    ) {
        return false
    }

    const requestId = ++songBookListRequestId
    const requestAuthGeneration = authGeneration
    state.isLoadingSongBooks = true
    songBookListLoadFailed = false

    if (showSuccessNotice) {
        setNotice(null)
    }

    renderSongBookState()
    renderSongBookControls()
    renderNotice()

    let succeeded = false
    let targetSongBookId = null

    try {
        const booksPage = await fetchAvailablePage(getSongBooks, page)

        if (
            requestId !== songBookListRequestId ||
            requestAuthGeneration !== authGeneration ||
            !isAuthenticated()
        ) {
            return false
        }

        state.songBooks = booksPage.items
        state.songBookPage = booksPage.page
        state.songBookHasNext = booksPage.hasNext

        if (selectSongBookId !== null) {
            targetSongBookId = selectSongBookId
        } else if (state.selectedSongBookId !== null) {
            targetSongBookId = state.selectedSongBookId
        } else if (
            state.songBookPage === 1 &&
            !state.songBookHasNext &&
            state.songBooks.length === 1
        ) {
            targetSongBookId = state.songBooks[0].id
        } else {
            clearSelectedSongBook()
        }

        succeeded = true
    } catch (error) {
        if (
            requestId !== songBookListRequestId ||
            requestAuthGeneration !== authGeneration
        ) {
            return false
        }

        if (await handleAuthenticationFailure(error)) {
            return false
        }

        console.error(error)
        songBookListLoadFailed = true
        setNotice("error", getLoadSongBooksErrorMessage(error))
    } finally {
        if (requestId === songBookListRequestId) {
            state.isLoadingSongBooks = false
            renderSongBookList()
            renderSongBookState()
            renderSelectedSongBook()
            renderSongBookControls()
            renderNotice()
        }
    }

    if (
        requestId !== songBookListRequestId ||
        requestAuthGeneration !== authGeneration ||
        !isAuthenticated()
    ) {
        return false
    }

    if (targetSongBookId !== null) {
        const selectedSummary = state.songBooks.find(
            book => book.id === targetSongBookId
        )
        const canRefreshCurrentSelection =
            state.selectedSongBookId === targetSongBookId &&
            state.selectedSongBook !== null

        if (canRefreshCurrentSelection) {
            if (selectedSummary !== undefined) {
                updateSelectedBookAccess({
                    ...state.selectedSongBook,
                    ...selectedSummary
                })
            } else {
                try {
                    const refreshed = await getSongBook(targetSongBookId)
                    if (
                        requestId !== songBookListRequestId ||
                        requestAuthGeneration !== authGeneration ||
                        state.selectedSongBookId !== targetSongBookId
                    ) {
                        return false
                    }

                    updateSelectedBookAccess(refreshed)
                } catch (error) {
                    if (
                        requestId !== songBookListRequestId ||
                        requestAuthGeneration !== authGeneration ||
                        state.selectedSongBookId !== targetSongBookId
                    ) {
                        return false
                    }

                    if (await handleSelectedBookFailure(error)) {
                        return false
                    }

                    console.error(error)
                    setNotice(
                        "error",
                        "The selected song book could not be verified. " +
                            "Try Refresh song books."
                    )
                    renderNotice()
                    return false
                }
            }

            if (isSongBookAdmin() && refreshMembers) {
                await loadSongBookMembers()
            }

            if (showSuccessNotice) {
                await loadSongBookPdfs({ force: true })
            }
            if (
                requestId !== songBookListRequestId ||
                requestAuthGeneration !== authGeneration ||
                state.selectedSongBookId !== targetSongBookId
            ) {
                return false
            }

            renderSelectedSongBook()
            if (refreshMembers || !isSongBookAdmin()) {
                renderSongBookMembers()
            }
            renderSongList()
            renderSongDetails()
            renderMutationControls()
        } else {
            const selected = await selectSongBook(targetSongBookId, {
                preserveNotice: !showSuccessNotice
            })
            if (!selected) {
                return false
            }
        }
    }

    if (
        requestId !== songBookListRequestId ||
        requestAuthGeneration !== authGeneration ||
        !isAuthenticated()
    ) {
        return false
    }

    if (succeeded && showSuccessNotice) {
        setNotice("success", "Song books loaded.")
        renderNotice()
    }

    return succeeded
}

export async function selectSongBook(
    id,
    {
        focusHeading = false,
        preserveNotice = false
    } = {}
) {
    if (
        !isAuthenticated() ||
        state.isLoadingSongBook ||
        state.isLoadingSongs ||
        state.isSaving ||
        state.deletingSongId !== null ||
        state.isSavingSongBookAccess ||
        id === undefined ||
        id === null ||
        String(id).trim() === ""
    ) {
        return false
    }

    const requestedId = id
    closeSongBookEditor()
    clearSelectedSongBook()
    const requestId = ++songBookSelectionRequestId
    const songRequestId = ++songCollectionRequestId
    const requestAuthGeneration = authGeneration
    state.selectedSongBookId = requestedId
    state.isLoadingSongBook = true
    state.isLoadingSongs = true

    if (!preserveNotice) {
        setNotice(null)
    }
    renderSongBookList()
    renderSelectedSongBook()
    renderSongBookMembers()
    renderSongList()
    renderCollectionState()
    renderSongDetails()
    renderSongBookControls()
    renderNotice()

    let loaded = false

    try {
        const [selectedSongBook, songsPageResponse] =
            await Promise.all([
                getSongBook(requestedId),
                getSongs(requestedId)
            ])

        if (
            requestId !== songBookSelectionRequestId ||
            songRequestId !== songCollectionRequestId ||
            requestAuthGeneration !== authGeneration ||
            state.selectedSongBookId !== requestedId ||
            !isAuthenticated()
        ) {
            return false
        }

        const songsPage = readPage(songsPageResponse, 1)
        state.selectedSongBook = selectedSongBook
        state.selectedSongBookAccessLevel =
            normalizeAccessLevel(selectedSongBook?.accessLevel)
        state.songs = songsPage.items
        state.songPage = songsPage.page
        state.songHasNext = songsPage.hasNext
        collectionLoadFailed = false
        loaded = true

        state.isLoadingSongBook = false
        state.isLoadingSongs = false
        renderSongBookList()
        renderSelectedSongBook()
        renderSongList()
        renderCollectionState()
        renderMutationControls()

        await Promise.all([
            loadSongBookPdfs(),
            isSongBookAdmin()
                ? loadSongBookMembers({ showErrorNotice: true })
                : Promise.resolve()
        ])

        return state.selectedSongBookId === requestedId &&
            requestAuthGeneration === authGeneration
    } catch (error) {
        if (
            requestId !== songBookSelectionRequestId ||
            requestAuthGeneration !== authGeneration ||
            state.selectedSongBookId !== requestedId
        ) {
            return false
        }

        collectionLoadFailed = state.selectedSongBook !== null
        songBookMembersLoadFailed =
            state.selectedSongBook !== null && isSongBookAdmin()

        if (await handleSelectedBookFailure(error)) {
            return false
        }

        console.error(error)
        setNotice("error", getLoadSongBookErrorMessage(error))
        return false
    } finally {
        if (
            requestId === songBookSelectionRequestId &&
            state.selectedSongBookId === requestedId
        ) {
            state.isLoadingSongBook = false
            state.isLoadingSongs = false
            renderSongBookList()
            renderSelectedSongBook()
            renderSongBookMembers()
            renderSongList()
            renderCollectionState()
            renderSongDetails()
            renderMutationControls()
            renderSongBookControls()
            renderNotice()

            if (loaded && focusHeading) {
                elements.selectedSongBookHeading.focus()
            }
        }
    }
}

export function beginCreateSongBook() {
    if (
        !isAuthenticated() ||
        state.isSavingSongBook ||
        state.isSaving ||
        state.deletingSongId !== null ||
        state.editorMode !== "idle" ||
        state.songBookFormMode !== "idle"
    ) {
        return false
    }

    state.songBookFormMode = "create"
    elements.songBookName.value = ""
    elements.songBookFormHeading.textContent = "Create song book"
    elements.saveSongBookButton.textContent = "Create song book"
    elements.songBookForm.hidden = false
    setNotice(null)
    renderMutationControls()
    renderSongBookControls()
    renderNotice()
    elements.songBookName.focus()
    return true
}

export function beginRenameSongBook() {
    if (
        !isSongBookAdmin() ||
        state.selectedSongBook === null ||
        state.isSavingSongBook ||
        state.isSaving ||
        state.deletingSongId !== null
    ) {
        return false
    }

    state.songBookFormMode = "rename"
    elements.songBookName.value = state.selectedSongBook.name ?? ""
    elements.songBookFormHeading.textContent = "Rename song book"
    elements.saveSongBookButton.textContent = "Save name"
    elements.songBookForm.hidden = false
    setNotice(null)
    renderMutationControls()
    renderSongBookControls()
    renderNotice()
    elements.songBookName.focus()
    return true
}

export function cancelSongBookEditor() {
    if (
        state.isSavingSongBook ||
        state.songBookFormMode === "idle"
    ) {
        return false
    }

    const cancelledMode = state.songBookFormMode
    closeSongBookEditor()
    setNotice(null)
    renderMutationControls()
    renderSongBookControls()
    renderNotice()

    if (cancelledMode === "rename") {
        elements.renameSongBookButton.focus()
    } else {
        elements.newSongBookButton.focus()
    }

    return true
}

export async function saveSongBook(event) {
    event.preventDefault()

    if (
        state.isSavingSongBook ||
        state.songBookFormMode === "idle" ||
        !elements.songBookForm.checkValidity()
    ) {
        elements.songBookForm.reportValidity()
        return false
    }

    const mode = state.songBookFormMode
    const selectedId = state.selectedSongBookId
    const payload = { name: elements.songBookName.value.trim() }
    const mutationId = ++songBookMutationId
    const requestAuthGeneration = authGeneration
    state.isSavingSongBook = true
    setNotice(
        "info",
        mode === "create"
            ? "Creating song book..."
            : "Renaming song book..."
    )
    renderSongBookControls()
    renderNotice()

    try {
        let targetId = selectedId
        let mutationSummary = null

        if (mode === "create") {
            const created = await createSongBook(payload)
            targetId = created.id
            mutationSummary = created
        } else {
            if (selectedId === null || !isSongBookAdmin()) {
                return false
            }

            await renameSongBook(selectedId, payload)
            mutationSummary = {
                ...state.selectedSongBook,
                id: selectedId,
                name: payload.name
            }
        }

        if (
            mutationId !== songBookMutationId ||
            requestAuthGeneration !== authGeneration ||
            !isAuthenticated()
        ) {
            return false
        }

        if (mode === "create") {
            upsertSongBookSummary(mutationSummary)
            clearSelectedSongBook()
            state.selectedSongBookId = targetId
            state.selectedSongBook = mutationSummary
            state.selectedSongBookAccessLevel =
                normalizeAccessLevel(mutationSummary?.accessLevel)
        } else {
            upsertSongBookSummary(mutationSummary)
            state.selectedSongBook = mutationSummary
        }

        closeSongBookEditor()
        const booksReloaded = await loadSongBooks({
            showSuccessNotice: false,
            selectSongBookId: targetId
        })
        if (
            mutationId !== songBookMutationId ||
            requestAuthGeneration !== authGeneration ||
            state.selectedSongBookId !== targetId
        ) {
            return false
        }
        await loadSongBookPdfs({ force: true })
        if (
            mutationId !== songBookMutationId ||
            requestAuthGeneration !== authGeneration ||
            state.selectedSongBookId !== targetId
        ) {
            return false
        }
        setNotice(
            booksReloaded ? "success" : "error",
            booksReloaded
                ? mode === "create"
                    ? "Song book created."
                    : "Song book renamed."
                : mode === "create"
                    ? "Song book created, but the song-book list " +
                        "could not be refreshed."
                    : "Song book renamed, but the song-book list " +
                        "could not be refreshed."
        )
        renderNotice()

        if (!elements.selectedSongBookPanel.hidden) {
            elements.selectedSongBookHeading.focus()
        }

        return true
    } catch (error) {
        if (
            mutationId !== songBookMutationId ||
            requestAuthGeneration !== authGeneration
        ) {
            return false
        }

        if (await handleAuthenticationFailure(error)) {
            return false
        }

        if (
            error instanceof ApiError &&
            error.status === 404 &&
            mode === "rename"
        ) {
            await handleSelectedBookFailure(error)
            return false
        }

        console.error(error)
        setNotice("error", getSaveSongBookErrorMessage(error, mode))
        renderNotice()
        return false
    } finally {
        if (mutationId === songBookMutationId) {
            state.isSavingSongBook = false
            renderMutationControls()
            renderSongBookControls()
        }
    }
}

export async function requestSongBookDeletion() {
    if (
        !isSongBookAdmin() ||
        state.selectedSongBookId === null ||
        state.selectedSongBook === null ||
        state.isSavingSongBook
    ) {
        return false
    }

    const songBookId = state.selectedSongBookId
    const mutationId = ++songBookMutationId
    const requestAuthGeneration = authGeneration
    const songBookName = displayValue(
        state.selectedSongBook.name,
        "Untitled song book"
    )
    const confirmed = window.confirm(
        `Delete "${songBookName}" and all of its songs and access entries? ` +
            "This cannot be undone."
    )

    if (!confirmed) {
        elements.deleteSongBookButton.focus()
        return false
    }

    state.isSavingSongBook = true
    setNotice("info", "Deleting song book...")
    renderSongBookControls()
    renderNotice()

    try {
        await deleteSongBook(songBookId)

        if (
            mutationId !== songBookMutationId ||
            requestAuthGeneration !== authGeneration ||
            state.selectedSongBookId !== songBookId
        ) {
            return false
        }

        state.songBooks = state.songBooks.filter(
            songBook => songBook.id !== songBookId
        )
        clearSelectedSongBook()
        renderSongBookList()
        const booksReloaded = await loadSongBooks({
            showSuccessNotice: false
        })
        setNotice(
            booksReloaded ? "success" : "error",
            booksReloaded
                ? "Song book deleted."
                : "Song book deleted, but the song-book list " +
                    "could not be refreshed."
        )
        renderNotice()
        focusSongBookList()
        return true
    } catch (error) {
        if (
            mutationId !== songBookMutationId ||
            requestAuthGeneration !== authGeneration
        ) {
            return false
        }

        if (await handleSelectedBookFailure(error)) {
            return false
        }

        console.error(error)
        setNotice("error", getDeleteSongBookErrorMessage(error))
        renderNotice()
        return false
    } finally {
        if (mutationId === songBookMutationId) {
            state.isSavingSongBook = false
            renderSongBookControls()
        }
    }
}

export async function loadSongBookMembers({
    showErrorNotice = false,
    page = state.memberPage
} = {}) {
    if (
        !isSongBookAdmin() ||
        state.selectedSongBookId === null ||
        state.isLoadingSongBookMembers
    ) {
        return false
    }

    const songBookId = state.selectedSongBookId
    const requestId = ++songBookMembersRequestId
    const requestAuthGeneration = authGeneration
    state.isLoadingSongBookMembers = true
    songBookMembersLoadFailed = false
    renderSongBookMembers()
    renderSongBookControls()

    try {
        const membersPage = await fetchAvailablePage(
            requestedPage => getSongBookAccess(songBookId, requestedPage),
            page
        )

        if (
            requestId !== songBookMembersRequestId ||
            requestAuthGeneration !== authGeneration ||
            state.selectedSongBookId !== songBookId ||
            !isSongBookAdmin()
        ) {
            return false
        }

        state.songBookMembers = membersPage.items
        state.memberPage = membersPage.page
        state.memberHasNext = membersPage.hasNext
        return true
    } catch (error) {
        if (
            requestId !== songBookMembersRequestId ||
            requestAuthGeneration !== authGeneration
        ) {
            return false
        }

        if (await handleSelectedBookFailure(error)) {
            return false
        }

        console.error(error)
        songBookMembersLoadFailed = true

        if (showErrorNotice) {
            setNotice(
                "error",
                "The collaborator list could not be loaded."
            )
            renderNotice()
        }

        return false
    } finally {
        if (
            requestId === songBookMembersRequestId &&
            state.selectedSongBookId === songBookId
        ) {
            state.isLoadingSongBookMembers = false
            renderSongBookMembers()
            renderSongBookControls()
        }
    }
}

export function beginEditSongBookMember(accessId) {
    const member = state.songBookMembers.find(
        candidate => candidate.id === accessId
    )

    if (!isSongBookAdmin() || member === undefined) {
        return false
    }

    elements.songBookAccessEmail.value = member.email ?? ""
    elements.songBookAccessLevel.value =
        normalizeAccessLevel(member.accessLevel) === "editor"
            ? "editor"
            : "reader"
    elements.songBookAccessEmail.focus()
    return true
}

export async function saveSongBookMember(event) {
    event.preventDefault()

    if (
        !isSongBookAdmin() ||
        state.selectedSongBookId === null ||
        state.isSavingSongBookAccess ||
        !elements.songBookAccessForm.checkValidity()
    ) {
        elements.songBookAccessForm.reportValidity()
        return false
    }

    const songBookId = state.selectedSongBookId
    const mutationId = ++songBookAccessMutationId
    const requestAuthGeneration = authGeneration
    const payload = {
        email: elements.songBookAccessEmail.value.trim(),
        accessLevel: elements.songBookAccessLevel.value
    }
    state.isSavingSongBookAccess = true
    setNotice("info", "Saving collaborator access...")
    renderSongBookControls()
    renderNotice()

    try {
        const savedMember = await setSongBookAccess(
            songBookId,
            payload
        )

        if (
            mutationId !== songBookAccessMutationId ||
            requestAuthGeneration !== authGeneration ||
            state.selectedSongBookId !== songBookId
        ) {
            return false
        }

        upsertSongBookMember(savedMember)
        elements.songBookAccessEmail.value = ""
        elements.songBookAccessLevel.value = "reader"
        const membersReloaded = await loadSongBookMembers()
        setNotice(
            membersReloaded ? "success" : "error",
            membersReloaded
                ? "Collaborator access saved."
                : "Collaborator access was saved, but the collaborator " +
                    "list could not be refreshed."
        )
        renderNotice()
        elements.songBookAccessEmail.focus()
        return true
    } catch (error) {
        if (
            mutationId !== songBookAccessMutationId ||
            requestAuthGeneration !== authGeneration
        ) {
            return false
        }

        if (
            error instanceof ApiError &&
            error.status === 404
        ) {
            try {
                await getSongBook(songBookId)
            } catch (bookError) {
                if (
                    requestId !== songCollectionRequestId ||
                    requestAuthGeneration !== authGeneration ||
                    state.selectedSongBookId !== songBookId ||
                    state.selectedSongId !== selectedId
                ) {
                    return false
                }

                if (await handleSelectedBookFailure(bookError)) {
                    return false
                }
            }

            console.error(error)
            setNotice(
                "error",
                "No registered account was found for that email."
            )
            renderNotice()
            return false
        }

        if (await handleSelectedBookFailure(error)) {
            return false
        }

        console.error(error)
        setNotice(
            "error",
            getSongBookAccessErrorMessage(error)
        )
        renderNotice()
        return false
    } finally {
        if (mutationId === songBookAccessMutationId) {
            state.isSavingSongBookAccess = false
            renderSongBookControls()
        }
    }
}

export async function requestSongBookMemberRemoval(
    accessId,
    triggerButton = null
) {
    const member = state.songBookMembers.find(
        candidate => candidate.id === accessId
    )

    if (
        !isSongBookAdmin() ||
        state.selectedSongBookId === null ||
        member === undefined ||
        state.isSavingSongBookAccess
    ) {
        return false
    }

    if (!window.confirm(`Remove access for "${member.email}"?`)) {
        triggerButton?.focus()
        return false
    }

    const songBookId = state.selectedSongBookId
    const mutationId = ++songBookAccessMutationId
    const requestAuthGeneration = authGeneration
    state.isSavingSongBookAccess = true
    setNotice("info", "Removing collaborator access...")
    renderSongBookControls()
    renderNotice()

    try {
        await removeSongBookAccess(songBookId, accessId)

        if (
            mutationId !== songBookAccessMutationId ||
            requestAuthGeneration !== authGeneration ||
            state.selectedSongBookId !== songBookId
        ) {
            return false
        }

        state.songBookMembers = state.songBookMembers.filter(
            candidate => candidate.id !== accessId
        )
        renderSongBookMembers()
        const membersReloaded = await loadSongBookMembers()
        setNotice(
            membersReloaded ? "success" : "error",
            membersReloaded
                ? "Collaborator access removed."
                : "Collaborator access was removed, but the " +
                    "collaborator list could not be refreshed."
        )
        renderNotice()
        elements.songBookAccessEmail.focus()
        return true
    } catch (error) {
        if (
            mutationId !== songBookAccessMutationId ||
            requestAuthGeneration !== authGeneration
        ) {
            return false
        }

        if (
            error instanceof ApiError &&
            error.status === 404
        ) {
            await loadSongBookMembers()

            if (state.selectedSongBookId !== songBookId) {
                return false
            }

            setNotice(
                "info",
                "That collaborator entry was already removed."
            )
            renderNotice()
            return true
        }

        if (await handleSelectedBookFailure(error)) {
            return false
        }

        console.error(error)
        setNotice("error", getSongBookAccessErrorMessage(error))
        renderNotice()
        return false
    } finally {
        if (mutationId === songBookAccessMutationId) {
            state.isSavingSongBookAccess = false
            renderSongBookControls()
        }
    }
}

export async function loadSongBookPdfs({
    page = state.pdfPage,
    showErrorNotice = false,
    showSuccessNotice = false,
    force = false
} = {}) {
    if (
        !canReadSongBookPdfs() ||
        state.isAuthPending ||
        (state.isLoadingPdfs && !force)
    ) {
        return false
    }

    const bookId = state.selectedSongBookId
    const requestId = ++pdfListRequestId
    const requestAuthGeneration = authGeneration
    state.isLoadingPdfs = true
    pdfListLoadFailed = false
    if (showSuccessNotice) {
        setNotice(null)
        renderNotice()
    }
    renderSongBookPdfs()

    try {
        const pdfPage = await fetchAvailablePage(
            requestedPage => getSongBookPdfs(bookId, requestedPage),
            page
        )

        if (
            requestId !== pdfListRequestId ||
            requestAuthGeneration !== authGeneration ||
            state.selectedSongBookId !== bookId ||
            state.isAuthPending ||
            !canReadSongBookPdfs()
        ) {
            return false
        }

        pdfPage.items.forEach(readPdfMetadata)
        state.songBookPdfs = pdfPage.items
        state.pdfPage = pdfPage.page
        state.pdfHasNext = pdfPage.hasNext
        if (showSuccessNotice) {
            setNotice("success", "PDF exports loaded.")
            renderNotice()
        }
        return true
    } catch (error) {
        if (
            requestId !== pdfListRequestId ||
            requestAuthGeneration !== authGeneration ||
            state.selectedSongBookId !== bookId ||
            state.isAuthPending
        ) {
            return false
        }

        if (await handleSelectedBookFailure(error)) {
            return false
        }

        console.error(error)
        pdfListLoadFailed = true
        if (showErrorNotice) {
            setNotice("error", getLoadPdfsErrorMessage(error))
            renderNotice()
        }
        return false
    } finally {
        if (
            requestId === pdfListRequestId &&
            state.selectedSongBookId === bookId
        ) {
            state.isLoadingPdfs = false
            renderSongBookPdfs()
        }
    }
}

export async function generateSongBookPdf(event) {
    event.preventDefault()

    if (
        !isSongBookAdmin() ||
        state.selectedSongBook === null ||
        state.isAuthPending ||
        state.isGeneratingPdf ||
        state.isSavingSongBook ||
        state.isSaving ||
        state.deletingSongId !== null ||
        !elements.songBookPdfForm.checkValidity()
    ) {
        elements.songBookPdfForm.reportValidity()
        return false
    }

    const bookId = state.selectedSongBookId
    const payload = {
        includeChords: elements.songBookPdfIncludeChords.checked
    }
    if (state.pdfScope === "selected") {
        if (state.pdfSelectedSongs.size === 0) {
            setNotice(
                "error",
                "Select at least one song in the Songs list before " +
                    "generating a PDF."
            )
            renderNotice()
            return false
        }
        payload.songIds = [...state.pdfSelectedSongs.keys()]
    }

    const mutationId = ++pdfMutationId
    const requestAuthGeneration = authGeneration
    state.isGeneratingPdf = true
    setNotice("info", "Generating PDF...")
    renderPdfControls()
    renderNotice()

    try {
        const created = readPdfMetadata(
            await createSongBookPdf(bookId, payload)
        )
        if (
            mutationId !== pdfMutationId ||
            requestAuthGeneration !== authGeneration ||
            state.selectedSongBookId !== bookId ||
            state.isAuthPending ||
            !isAuthenticated()
        ) {
            return false
        }

        state.songBookPdfs = [
            created,
            ...state.songBookPdfs.filter(pdf => pdf.id !== created.id)
        ].slice(0, 50)
        state.pdfPage = 1
        renderSongBookPdfs()
        const refreshed = await loadSongBookPdfs({
            page: 1,
            force: true
        })
        if (
            mutationId !== pdfMutationId ||
            requestAuthGeneration !== authGeneration ||
            state.selectedSongBookId !== bookId
        ) {
            return false
        }

        setNotice(
            refreshed ? "success" : "error",
            refreshed
                ? "PDF generated."
                : "PDF generated, but the export list could not be " +
                    "refreshed. Try Refresh PDFs."
        )
        renderNotice()
        return true
    } catch (error) {
        if (
            mutationId !== pdfMutationId ||
            requestAuthGeneration !== authGeneration ||
            state.selectedSongBookId !== bookId ||
            state.isAuthPending
        ) {
            return false
        }

        if (await handleAuthenticationFailure(error)) {
            return false
        }

        if (
            error instanceof ApiError &&
            [403, 404].includes(error.status)
        ) {
            try {
                const book = await getSongBook(bookId)
                if (
                    mutationId !== pdfMutationId ||
                    requestAuthGeneration !== authGeneration ||
                    state.selectedSongBookId !== bookId
                ) {
                    return false
                }

                updateSelectedBookAccess(book)
                setNotice(
                    "error",
                    error.status === 404
                        ? "A selected song is no longer available. " +
                            "Refresh songs and update your selection."
                        : isSongBookAdmin()
                            ? "PDF generation was not permitted. " +
                                "Try Refresh song books."
                            : "Only the song-book owner can generate PDFs."
                )
                renderNotice()
                return false
            } catch (bookError) {
                if (
                    mutationId !== pdfMutationId ||
                    requestAuthGeneration !== authGeneration ||
                    state.selectedSongBookId !== bookId
                ) {
                    return false
                }
                if (await handleSelectedBookFailure(bookError)) {
                    return false
                }
                console.error(bookError)
            }
        }

        console.error(error)
        setNotice("error", getGeneratePdfErrorMessage(error))
        renderNotice()
        return false
    } finally {
        if (
            mutationId === pdfMutationId &&
            state.selectedSongBookId === bookId
        ) {
            state.isGeneratingPdf = false
            renderPdfControls()
        }
    }
}

export async function downloadPdf(pdfId) {
    if (
        !canReadSongBookPdfs() ||
        state.isAuthPending ||
        state.downloadingPdfId !== null ||
        !state.songBookPdfs.some(pdf => pdf.id === pdfId)
    ) {
        return false
    }

    const bookId = state.selectedSongBookId
    const requestId = ++pdfDownloadRequestId
    const requestAuthGeneration = authGeneration
    state.downloadingPdfId = pdfId
    renderPdfControls()

    try {
        const blob = await downloadSongBookPdf(bookId, pdfId)
        if (
            requestId !== pdfDownloadRequestId ||
            requestAuthGeneration !== authGeneration ||
            state.selectedSongBookId !== bookId ||
            state.isAuthPending ||
            !canReadSongBookPdfs()
        ) {
            return false
        }
        if (
            !(blob instanceof Blob) ||
            blob.size === 0 ||
            (
                blob.type !== "" &&
                !["application/pdf", "application/octet-stream"].includes(
                    blob.type.split(";")[0]
                )
            )
        ) {
            throw new ApiError("The API returned an invalid PDF file.")
        }

        const objectUrl = URL.createObjectURL(blob)
        const link = document.createElement("a")
        link.href = objectUrl
        link.download = pdfDownloadName(
            state.selectedSongBook.name,
            pdfId
        )
        try {
            document.body.appendChild(link)
            link.click()
        } finally {
            link.remove()
            setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
        }
        return true
    } catch (error) {
        if (
            requestId !== pdfDownloadRequestId ||
            requestAuthGeneration !== authGeneration ||
            state.selectedSongBookId !== bookId ||
            state.isAuthPending
        ) {
            return false
        }

        if (error instanceof ApiError && error.status === 404) {
            try {
                const book = await getSongBook(bookId)
                if (
                    requestId !== pdfDownloadRequestId ||
                    requestAuthGeneration !== authGeneration ||
                    state.selectedSongBookId !== bookId
                ) {
                    return false
                }

                updateSelectedBookAccess(book)
                const refreshed = await loadSongBookPdfs({
                    force: true
                })
                if (state.selectedSongBookId === bookId) {
                    setNotice(
                        "error",
                        refreshed
                            ? "That PDF export is no longer available. " +
                                "The list was refreshed."
                            : "That PDF export is no longer available. " +
                                "The PDF list could not be refreshed. " +
                                "Try Refresh PDFs."
                    )
                    renderNotice()
                }
                return false
            } catch (bookError) {
                if (
                    requestId !== pdfDownloadRequestId ||
                    requestAuthGeneration !== authGeneration ||
                    state.selectedSongBookId !== bookId
                ) {
                    return false
                }
                if (await handleSelectedBookFailure(bookError)) {
                    return false
                }
                console.error(bookError)
            }
        }

        if (await handleSelectedBookFailure(error)) {
            return false
        }
        console.error(error)
        setNotice("error", getDownloadPdfErrorMessage(error))
        renderNotice()
        return false
    } finally {
        if (
            requestId === pdfDownloadRequestId &&
            state.selectedSongBookId === bookId
        ) {
            state.downloadingPdfId = null
            renderPdfControls()
        }
    }
}

function readPdfMetadata(pdf) {
    if (
        pdf === null ||
        typeof pdf !== "object" ||
        typeof pdf.id !== "string" ||
        pdf.id.trim() === "" ||
        typeof pdf.includeChords !== "boolean" ||
        typeof pdf.isWholeBook !== "boolean" ||
        !Number.isSafeInteger(pdf.songCount) ||
        pdf.songCount < 0 ||
        !Array.isArray(pdf.selectedSongs) ||
        !pdf.selectedSongs.every(song =>
            song !== null &&
            typeof song === "object" &&
            typeof song.id === "string" &&
            typeof song.title === "string"
        ) ||
        typeof pdf.generatedAtUtc !== "string" ||
        Number.isNaN(Date.parse(pdf.generatedAtUtc)) ||
        typeof pdf.isOutdated !== "boolean"
    ) {
        throw new ApiError("The API returned invalid PDF metadata.")
    }

    return pdf
}

function pdfDownloadName(bookName, pdfId) {
    const safeBookName = displayValue(bookName, "song-book")
        .replace(/[\\/:*?"<>|\x00-\x1f]/g, "_")
        .replace(/[. ]+$/g, "")
        .slice(0, 80) || "song-book"
    const safeId = pdfId.replace(/[^\w-]/g, "_").slice(0, 64)
    return `${safeBookName}-${safeId || "export"}.pdf`
}

export function renderSongBookList() {
    if (renderedBooks !== state.songBooks) {
        const items = []
        bookRows = new Map()

        for (const songBook of state.songBooks) {
            const listItem = document.createElement("li")
            listItem.className = "song-book-list__item"

            const summary = document.createElement("span")
            summary.className = "song-book-list__summary"
            summary.textContent = displayValue(
                songBook.name,
                "Untitled song book"
            )

            const meta = document.createElement("span")
            meta.className = "song-book-list__meta"
            meta.textContent = `${formatAccessLevel(
                songBook.accessLevel
            )}, ${Number(songBook.songCount ?? 0)} songs`

            const selectButton = document.createElement("button")
            selectButton.className = "song-book-list__button"
            selectButton.type = "button"
            selectButton.dataset.action = "select-song-book"
            selectButton.dataset.songBookId = songBook.id
            selectButton.setAttribute(
                "aria-label",
                `Open ${summary.textContent}, ${meta.textContent}`
            )
            selectButton.addEventListener("click", async event => {
                await selectSongBook(event.currentTarget.dataset.songBookId, {
                    focusHeading: true
                })
            })
            selectButton.appendChild(summary)
            selectButton.appendChild(meta)
            listItem.appendChild(selectButton)
            items.push(listItem)
            bookRows.set(songBook.id, {
                listItem,
                selectButton,
                label: `${summary.textContent}, ${meta.textContent}`
            })
        }

        elements.songBookList.replaceChildren(...items)
        renderedBooks = state.songBooks
        renderedBookSelection = null
        renderedBookBusy = null
    }

    if (renderedBookSelection !== state.selectedSongBookId) {
        for (const id of [renderedBookSelection, state.selectedSongBookId]) {
            const row = bookRows.get(id)
            if (row === undefined) {
                continue
            }

            const selected = id === state.selectedSongBookId
            row.listItem.className = selected
                ? "song-book-list__item song-book-list__item--selected"
                : "song-book-list__item"
            row.selectButton.setAttribute(
                "aria-label",
                `${selected ? "Selected" : "Open"} ${row.label}`
            )
            if (selected) {
                row.selectButton.setAttribute("aria-current", "true")
            } else {
                row.selectButton.removeAttribute("aria-current")
            }
        }
        renderedBookSelection = state.selectedSongBookId
    }

    const busy = state.isLoadingSongBook ||
        state.isLoadingSongs ||
        state.isSavingSongBook ||
        state.isSavingSongBookAccess ||
        state.isSaving ||
        state.deletingSongId !== null
    if (renderedBookBusy !== busy) {
        for (const row of bookRows.values()) {
            row.selectButton.disabled = busy
        }
        renderedBookBusy = busy
    }
}

export function renderSongBookState() {
    renderBookPageControls()
    elements.songBookList.setAttribute(
        "aria-busy",
        String(state.isLoadingSongBooks)
    )

    if (!isAuthenticated()) {
        elements.songBookListState.textContent =
            "Sign in to load private song books."
        return
    }

    if (state.isLoadingSongBooks) {
        elements.songBookListState.textContent = "Loading song books..."
        return
    }

    if (songBookListLoadFailed && state.songBooks.length === 0) {
        elements.songBookListState.textContent =
            "Song books could not be loaded."
        return
    }

    if (state.songBooks.length === 0) {
        elements.songBookListState.textContent =
            state.songBookPage === 1
                ? "No song books yet. Create the first one."
                : "No song books on this page. Go to a previous page."
        return
    }

    elements.songBookListState.textContent =
        state.selectedSongBookId === null
            ? "Choose a song book."
            : ""
}

export function renderSelectedSongBook() {
    const hasSelectedBook =
        state.selectedSongBookId !== null &&
        (state.selectedSongBook !== null || state.isLoadingSongBook)
    elements.selectedSongBookPanel.hidden = !hasSelectedBook

    if (!hasSelectedBook) {
        elements.selectedSongBookHeading.textContent =
            "Selected song book"
        elements.renameSongBookButton.hidden = true
        elements.deleteSongBookButton.hidden = true
        elements.songBookAccessPanel.hidden = true
        renderSongBookPdfs()
        return
    }

    if (state.isLoadingSongBook || state.selectedSongBook === null) {
        elements.selectedSongBookHeading.textContent =
            "Loading selected song book..."
    } else {
        elements.selectedSongBookHeading.textContent =
            `${displayValue(
                state.selectedSongBook.name,
                "Untitled song book"
            )} (${formatAccessLevel(
                state.selectedSongBookAccessLevel
            )})`
    }

    const admin = isSongBookAdmin()
    elements.renameSongBookButton.hidden = !admin
    elements.deleteSongBookButton.hidden = !admin
    elements.songBookAccessPanel.hidden = !admin
    renderSongBookPdfs()
}

export function renderSongBookPdfs() {
    const available = canReadSongBookPdfs()
    elements.songBookPdfsPanel.hidden = !available
    elements.songBookPdfsList.setAttribute(
        "aria-busy",
        String(state.isLoadingPdfs)
    )
    renderPdfList()
    renderPdfControls()

    if (!available) {
        elements.songBookPdfsState.textContent = ""
    } else if (state.isLoadingPdfs) {
        elements.songBookPdfsState.textContent =
            "Loading PDF exports..."
    } else if (pdfListLoadFailed) {
        elements.songBookPdfsState.textContent =
            "PDF exports could not be refreshed. Displayed exports " +
            "and statuses may be out of date. Try Refresh PDFs."
    } else if (state.songBookPdfs.length === 0) {
        elements.songBookPdfsState.textContent =
            state.pdfPage === 1
                ? "No PDF exports yet."
                : "No PDFs on this page. Go to a previous page."
    } else {
        elements.songBookPdfsState.textContent = ""
    }
}

function renderPdfList() {
    if (renderedPdfs === state.songBookPdfs) {
        return
    }

    const items = state.songBookPdfs.map(pdf => {
        const item = document.createElement("li")
        item.className = "pdf-list__item"

        const format = document.createElement("strong")
        format.textContent = pdf.includeChords
            ? "With chords"
            : "Lyrics only"

        const scope = document.createElement("span")
        const songCount = `${pdf.songCount} ` +
            (pdf.songCount === 1 ? "song" : "songs")
        scope.textContent = pdf.isWholeBook
            ? `Entire book (${songCount})`
            : `Selected songs (${songCount}): ` +
                pdf.selectedSongs.map(song =>
                    displayValue(song.title, "Untitled song")
                ).join(", ")

        const metadata = document.createElement("div")
        metadata.className = "pdf-list__meta"
        const generated = document.createElement("time")
        generated.dateTime = pdf.generatedAtUtc
        generated.textContent =
            `Generated ${new Date(pdf.generatedAtUtc).toLocaleString()}`
        const status = document.createElement("span")
        status.className = pdf.isOutdated
            ? "pdf-list__status--outdated"
            : ""
        status.textContent = pdf.isOutdated
            ? "Outdated — song book changed"
            : "Up to date"
        metadata.appendChild(generated)
        metadata.appendChild(status)

        const downloadButton = document.createElement("button")
        downloadButton.className = "button button--neutral"
        downloadButton.type = "button"
        downloadButton.dataset.action = "download-pdf"
        downloadButton.dataset.pdfId = pdf.id
        downloadButton.textContent = "Download PDF"
        downloadButton.setAttribute(
            "aria-label",
            `Download ${format.textContent.toLowerCase()} PDF, ` +
                scope.textContent
        )

        item.appendChild(format)
        item.appendChild(scope)
        item.appendChild(metadata)
        item.appendChild(downloadButton)
        return item
    })

    elements.songBookPdfsList.replaceChildren(...items)
    renderedPdfs = state.songBookPdfs
}

function renderPdfControls() {
    const available = canReadSongBookPdfs()
    const admin = available && isSongBookAdmin()
    const busy = state.isGeneratingPdf ||
        state.isSavingSongBook ||
        state.isSaving ||
        state.deletingSongId !== null ||
        state.isAuthPending
    renderPageControls(elements.pdfPagination, {
        page: state.pdfPage,
        hasNext: state.pdfHasNext,
        busy: state.isLoadingPdfs || busy,
        available
    })
    elements.refreshSongBookPdfsButton.disabled =
        !available || state.isLoadingPdfs || busy
    elements.songBookPdfForm.hidden = !admin
    elements.songBookPdfForm.setAttribute(
        "aria-busy",
        String(state.isGeneratingPdf)
    )
    elements.songBookPdfScope.value = state.pdfScope
    for (const control of Array.from(elements.songBookPdfForm.elements)) {
        control.disabled = !admin || busy
    }

    const selecting = admin && state.pdfScope === "selected"
    elements.songBookPdfSelectionState.hidden = !selecting
    elements.songBookPdfSelectionState.textContent = selecting
        ? state.pdfSelectedSongs.size === 0
            ? "No songs selected. Choose songs in the Songs list below; " +
                "use song pages to reach every song."
            : `${state.pdfSelectedSongs.size} songs selected: ` +
                `${[...state.pdfSelectedSongs.values()].join(", ")}. ` +
                "Use song pages to select more."
        : ""

    for (const button of findDescendants(
        elements.songBookPdfsList,
        element => element.tagName === "BUTTON"
    )) {
        button.disabled = !available ||
            state.isLoadingPdfs ||
            state.downloadingPdfId !== null ||
            state.isAuthPending
    }
    for (const row of songRows.values()) {
        if (row.pdfCheckbox !== null) {
            row.pdfCheckbox.disabled = !selecting || busy
        }
    }
}

export function renderSongBookMembers() {
    renderMemberPageControls()
    elements.songBookAccessList.replaceChildren()
    elements.songBookAccessState.textContent = ""
    elements.songBookAccessList.setAttribute(
        "aria-busy",
        String(state.isLoadingSongBookMembers)
    )

    if (!isSongBookAdmin()) {
        return
    }

    if (state.isLoadingSongBookMembers) {
        elements.songBookAccessState.textContent =
            "Loading collaborators..."
        return
    }

    if (songBookMembersLoadFailed) {
        elements.songBookAccessState.textContent =
            "Collaborators could not be loaded."
        return
    }

    if (state.songBookMembers.length === 0) {
        elements.songBookAccessState.textContent =
            state.memberPage === 1
                ? "No collaborators."
                : "No collaborators on this page. Go to a previous page."
        return
    }

    for (const member of state.songBookMembers) {
        const item = document.createElement("li")
        item.className = "song-book-access-list__item"

        const summary = document.createElement("span")
        summary.className = "song-book-access-list__summary"
        summary.textContent = `${member.email} (` +
            `${formatAccessLevel(member.accessLevel)})`

        const actions = document.createElement("div")
        actions.className = "toolbar"

        const changeButton = document.createElement("button")
        changeButton.className = "button button--neutral"
        changeButton.type = "button"
        changeButton.dataset.action = "edit-song-book-access"
        changeButton.dataset.accessId = member.id
        changeButton.textContent = "Change"
        changeButton.setAttribute(
            "aria-label",
            `Change access for ${member.email}`
        )

        const removeButton = document.createElement("button")
        removeButton.className = "button button--destructive"
        removeButton.type = "button"
        removeButton.dataset.action = "remove-song-book-access"
        removeButton.dataset.accessId = member.id
        removeButton.textContent = "Remove"
        removeButton.setAttribute(
            "aria-label",
            `Remove access for ${member.email}`
        )

        actions.appendChild(changeButton)
        actions.appendChild(removeButton)
        item.appendChild(summary)
        item.appendChild(actions)
        elements.songBookAccessList.appendChild(item)
    }
}

export async function loadSongs({
    showSuccessNotice = true,
    page = state.songPage
} = {}) {
    if (
        state.isLoadingSongs ||
        state.selectedSongBookId === null ||
        !isAuthenticated()
    ) {
        return false
    }

    const songBookId = state.selectedSongBookId
    const requestId = ++songCollectionRequestId
    const requestAuthGeneration = authGeneration
    state.isLoadingSongs = true
    if (showSuccessNotice) {
        setNotice(null)
    }
    renderCollectionState()
    renderNotice()

    let succeeded = false
    let focusListAfterLoad = false

    try {
        const songsPage = await fetchAvailablePage(
            requestedPage => getSongs(songBookId, requestedPage),
            page
        )

        if (
            requestId !== songCollectionRequestId ||
            requestAuthGeneration !== authGeneration ||
            state.selectedSongBookId !== songBookId ||
            !isAuthenticated()
        ) {
            return false
        }

        const selectedWasVisible =
            state.selectedSongId !== null &&
            state.songs.some(
                song => song.id === state.selectedSongId
            )
        const selectionMissingFromPage =
            !state.isSaving &&
            !state.isLoadingSong &&
            songsPage.page === state.songPage &&
            selectedWasVisible &&
            state.selectedSongId !== null &&
            !songsPage.items.some(
                song => song.id === state.selectedSongId
            )

        state.songs = songsPage.items
        state.songPage = songsPage.page
        state.songHasNext = songsPage.hasNext
        for (const song of state.songs) {
            if (state.pdfSelectedSongs.has(song.id)) {
                state.pdfSelectedSongs.set(
                    song.id,
                    displayValue(song.title, "Untitled song")
                )
            }
        }
        renderPdfControls()
        collectionLoadFailed = false

        let selectionWasRemoved = false
        if (selectionMissingFromPage) {
            const selectedId = state.selectedSongId
            try {
                const selectedSong = await getSong(songBookId, selectedId)
                if (
                    requestId !== songCollectionRequestId ||
                    requestAuthGeneration !== authGeneration ||
                    state.selectedSongBookId !== songBookId ||
                    state.selectedSongId !== selectedId
                ) {
                    return false
                }
                if (selectedSong?.id !== selectedId) {
                    throw new ApiError(
                        "The API returned an invalid selected song."
                    )
                }
                state.selectedSong = selectedSong
            } catch (error) {
                if (
                    requestId !== songCollectionRequestId ||
                    requestAuthGeneration !== authGeneration ||
                    state.selectedSongBookId !== songBookId ||
                    state.selectedSongId !== selectedId
                ) {
                    return false
                }

                if (error instanceof ApiError && error.status === 404) {
                    try {
                        const book = await getSongBook(songBookId)
                        if (
                            requestId !== songCollectionRequestId ||
                            requestAuthGeneration !== authGeneration ||
                            state.selectedSongBookId !== songBookId
                        ) {
                            return false
                        }
                        state.selectedSongBook = book
                        state.selectedSongBookAccessLevel =
                            normalizeAccessLevel(book?.accessLevel)
                    } catch (bookError) {
                        if (await handleSelectedBookFailure(bookError)) {
                            return false
                        }
                        console.error(bookError)
                        setNotice(
                            "error",
                            "Songs loaded, but the selected song " +
                                "could not be verified. Try View again."
                        )
                        return false
                    }

                    selectionWasRemoved = true
                    focusListAfterLoad = state.editorMode !== "idle"
                    clearSelection()
                } else {
                    if (await handleSelectedBookFailure(error)) {
                        return false
                    }
                    console.error(error)
                    setNotice(
                        "error",
                        "Songs loaded, but the selected song " +
                            "could not be verified. Try View again."
                    )
                    return false
                }
            }
        }

        if (showSuccessNotice) {
            await loadSongBookPdfs({ force: true })
            if (
                requestId !== songCollectionRequestId ||
                requestAuthGeneration !== authGeneration ||
                state.selectedSongBookId !== songBookId
            ) {
                return false
            }
            setNotice(
                "success",
                selectionWasRemoved
                    ? "Songs loaded. The selected song is no longer available."
                    : "Songs loaded."
            )
        }

        succeeded = true
    } catch (error) {
        if (
            requestId !== songCollectionRequestId ||
            requestAuthGeneration !== authGeneration
        ) {
            return false
        }

        if (await handleSelectedBookFailure(error)) {
            return false
        }

        console.error(error)
        collectionLoadFailed = true
        setNotice("error", getLoadSongsErrorMessage(error))
    } finally {
        if (
            requestId === songCollectionRequestId &&
            state.selectedSongBookId === songBookId
        ) {
            state.isLoadingSongs = false
            renderSongList()
            renderCollectionState()
            renderSongDetails()
            renderMutationControls()
            renderNotice()

            if (focusListAfterLoad) {
                focusSongListHeading()
            }
        }
    }

    return succeeded
}

export async function selectSong(
    id,
    { focusDetails = false } = {}
) {
    if (state.selectedSongBookId === null || !isAuthenticated()) {
        return false
    }

    if (state.editorMode !== "idle" && !state.isSaving) {
        closeEditor()
    }

    const songBookId = state.selectedSongBookId
    const requestedId = id
    cancelSongDetailRequest()
    const requestId = songDetailRequestId
    const controller = new AbortController()
    songDetailController = controller
    const requestAuthGeneration = authGeneration
    state.selectedSongId = requestedId
    state.selectedSong = null
    state.showChords = true
    state.isLoadingSong = true
    setNotice(null)
    renderSongList()
    renderSongDetails()
    renderNotice()

    let songLoaded = false

    try {
        const song = await getSong(songBookId, requestedId, {
            signal: controller.signal
        })

        if (
            controller.signal.aborted ||
            requestId !== songDetailRequestId ||
            requestAuthGeneration !== authGeneration ||
            state.selectedSongBookId !== songBookId ||
            state.selectedSongId !== requestedId ||
            !isAuthenticated()
        ) {
            return false
        }

        state.selectedSong = song
        songLoaded = true
        return true
    } catch (error) {
        if (
            controller.signal.aborted ||
            requestId !== songDetailRequestId ||
            requestAuthGeneration !== authGeneration ||
            state.selectedSongBookId !== songBookId ||
            state.selectedSongId !== requestedId
        ) {
            return false
        }

        if (error instanceof ApiError && error.status === 403) {
            await handleSelectedBookFailure(error)
            return false
        }

        console.error(error)

        if (error instanceof ApiError && error.status === 404) {
            clearSelection()
            const refreshed = await loadSongs({
                showSuccessNotice: false
            })

            if (state.selectedSongBookId !== songBookId) {
                return false
            }

            if (state.selectedSongId === null) {
                setNotice(
                    "error",
                    refreshed
                        ? "This song no longer exists. " +
                            "The list was refreshed."
                        : "This song no longer exists. " +
                            "The song list could not be refreshed. " +
                            "Try Refresh songs."
                )
                renderNotice()

                if (focusDetails) {
                    focusSongListHeading()
                }
            }

            return false
        }

        state.selectedSong = null
        setNotice("error", getLoadSongErrorMessage(error))
        return false
    } finally {
        if (songDetailController === controller) {
            songDetailController = null
        }

        if (
            requestId === songDetailRequestId &&
            state.selectedSongBookId === songBookId &&
            state.selectedSongId === requestedId
        ) {
            state.isLoadingSong = false
            renderSongList()
            renderSongDetails()
            renderNotice()

            if (songLoaded && focusDetails) {
                focusSelectedSong(requestedId)
            }
        }
    }
}

function cancelSongDetailRequest() {
    songDetailRequestId += 1
    songDetailController?.abort()
    songDetailController = null
}

export function clearSelection() {
    cancelSongDetailRequest()

    if (state.editorMode !== "idle") {
        closeEditor()
    }

    state.selectedSongId = null
    state.selectedSong = null
    state.isLoadingSong = false
    renderSongList()
    renderSongDetails()
}

export function beginCreateSong() {
    if (
        state.isSaving ||
        state.songBookFormMode !== "idle" ||
        state.isSavingSongBook ||
        !canManageSongs()
    ) {
        if (!isAuthenticated()) {
            openAuthView("login", elements.showLoginButton)
        }
        return false
    }

    state.editorMode = "create"
    cancelSongDetailRequest()
    state.selectedSongId = null
    state.selectedSong = null
    state.isLoadingSong = false
    state.draftParts = []
    setNotice(null)
    populateSongForm(elements.songForm)
    openEditor("Create song", "Create song")
    renderSongList()
    renderNotice()
    return true
}

export function beginEditSong() {
    if (
        !canManageSongs() ||
        state.isSaving ||
        isSelectedSongDeleting() ||
        state.selectedSong === null
    ) {
        return false
    }

    state.editorMode = "edit"
    state.draftParts = (state.selectedSong.parts ?? [])
        .map(part => createPartDraft(part))
    setNotice(null)
    populateSongForm(elements.songForm, state.selectedSong)
    openEditor("Edit song", "Save changes")
    renderNotice()
    return true
}

export function cancelSongEditor() {
    if (
        state.isSaving ||
        isSelectedSongDeleting() ||
        state.editorMode === "idle"
    ) {
        return false
    }

    const cancelledMode = state.editorMode
    closeEditor()
    setNotice(null)
    renderSongList()
    renderSongDetails()
    renderNotice()
    focusAfterEditorCancel(cancelledMode)
    return true
}

export async function saveSong(event) {
    event.preventDefault()

    if (
        state.isSaving ||
        isSelectedSongDeleting() ||
        state.editorMode === "idle"
    ) {
        return false
    }

    if (!elements.songForm.checkValidity()) {
        elements.songForm.reportValidity()
        return false
    }

    const saveMode = state.editorMode
    const selectedSongBookId = state.selectedSongBookId
    const selectedSongId = state.selectedSongId

    if (selectedSongBookId === null || !canManageSongs()) {
        setNotice(
            "error",
            "Select a song book with Editor access before saving."
        )
        renderNotice()
        return false
    }

    if (saveMode === "edit" && selectedSongId === null) {
        setNotice(
            "error",
            "The selected song could not be identified."
        )
        renderNotice()
        return false
    }

    const payload = buildSongPayload(
        elements.songForm,
        state.draftParts
    )
    const mutationId = ++songMutationId
    const requestAuthGeneration = authGeneration
    let savedSongId = null
    let createdSong = null
    let mutationSucceeded = false

    state.isSaving = true
    setNotice(
        "info",
        saveMode === "create"
            ? "Creating song..."
            : "Saving changes..."
    )
    renderMutationControls()
    renderSongList()
    renderSongDetails()
    renderNotice()

    try {
        if (saveMode === "create") {
            createdSong = await createSong(
                selectedSongBookId,
                payload
            )
            savedSongId = createdSong?.id ?? null
        } else {
            await updateSong(
                selectedSongBookId,
                selectedSongId,
                payload
            )
            savedSongId = selectedSongId
        }

        if (
            mutationId !== songMutationId ||
            requestAuthGeneration !== authGeneration ||
            state.selectedSongBookId !== selectedSongBookId ||
            !isAuthenticated()
        ) {
            return false
        }

        if (
            saveMode === "create" &&
            (
                typeof savedSongId !== "string" ||
                savedSongId.trim() === "" ||
                !Array.isArray(createdSong?.parts)
            )
        ) {
            console.error(new ApiError(
                "The API returned an invalid created song."
            ))
            setNotice(
                "error",
                "The song may have been created, but the API returned " +
                    "an invalid response. Refresh songs before trying again."
            )
            renderNotice()
            return false
        }

        mutationSucceeded = true
        if (
            saveMode === "edit" &&
            state.pdfSelectedSongs.has(selectedSongId)
        ) {
            state.pdfSelectedSongs.set(
                selectedSongId,
                displayValue(payload.title, "Untitled song")
            )
            renderPdfControls()
        }
        closeEditor()
        let collectionLoaded
        let detailLoaded
        if (saveMode === "create") {
            cancelSongDetailRequest()
            state.selectedSongId = savedSongId
            state.selectedSong = createdSong
            state.isLoadingSong = false
            renderSongList()
            renderSongDetails()
            collectionLoaded = await loadSongs({
                showSuccessNotice: false
            })
            detailLoaded = true
        } else {
            [collectionLoaded, detailLoaded] = await Promise.all([
                loadSongs({ showSuccessNotice: false }),
                selectSong(savedSongId)
            ])
        }

        if (
            mutationId !== songMutationId ||
            requestAuthGeneration !== authGeneration ||
            state.selectedSongBookId !== selectedSongBookId
        ) {
            return false
        }

        await loadSongBookPdfs({ force: true })
        if (
            mutationId !== songMutationId ||
            requestAuthGeneration !== authGeneration ||
            state.selectedSongBookId !== selectedSongBookId
        ) {
            return false
        }
        const postSaveNotice = getPostSaveNotice({
            collectionLoaded,
            detailLoaded,
            saveMode
        })
        setNotice(postSaveNotice.type, postSaveNotice.message)
        renderNotice()
        return true
    } catch (error) {
        if (
            mutationId !== songMutationId ||
            requestAuthGeneration !== authGeneration ||
            state.selectedSongBookId !== selectedSongBookId
        ) {
            return false
        }

        if (await handleMutationAuthorizationFailure(error)) {
            return false
        }

        if (
            error instanceof ApiError &&
            error.status === 404 &&
            saveMode === "create"
        ) {
            await handleSelectedBookFailure(error)
            return false
        }

        if (
            error instanceof ApiError &&
            error.status === 404 &&
            saveMode === "edit" &&
            await handleAmbiguousSongNotFound(selectedSongBookId)
        ) {
            return false
        }

        console.error(error)
        setNotice("error", getSaveErrorMessage(error, saveMode))
        renderNotice()
        return false
    } finally {
        if (mutationId === songMutationId) {
            state.isSaving = false
            renderMutationControls()
            renderSongList()
            renderCollectionState()
            renderSongDetails()
            renderNotice()

            if (mutationSucceeded) {
                focusSelectedSong(savedSongId)
            }
        }
    }
}

export async function requestSongDeletion(id, triggerButton = null) {
    if (
        !canManageSongs() ||
        state.deletingSongId !== null ||
        state.isSaving
    ) {
        if (!isAuthenticated()) {
            openAuthView("login", elements.showLoginButton)
        }
        return false
    }

    const songName = getDeletionSongName(id)
    const songBookId = state.selectedSongBookId

    if (songBookId === null) {
        return false
    }

    const triggeredFromDetails =
        triggerButton !== null &&
        isDescendantOf(elements.songDetails, triggerButton)
    const confirmed = window.confirm(
        `Delete "${songName}"? This cannot be undone.`
    )

    if (!confirmed) {
        triggerButton?.focus()
        return false
    }

    const mutationId = ++songMutationId
    const requestAuthGeneration = authGeneration
    state.deletingSongId = id
    setNotice("info", "Deleting song...")
    renderSongList()
    renderSongDetails()
    renderMutationControls()
    renderNotice()

    let focusTarget = "restore-delete"

    try {
        await deleteSong(songBookId, id)

        if (
            mutationId !== songMutationId ||
            requestAuthGeneration !== authGeneration ||
            state.selectedSongBookId !== songBookId ||
            !isAuthenticated()
        ) {
            return false
        }

        if (state.selectedSongId === id) {
            clearSelection()
        }
        state.pdfSelectedSongs.delete(id)
        renderPdfControls()

        const collectionLoaded = await loadSongs({
            showSuccessNotice: false
        })

        if (
            mutationId !== songMutationId ||
            requestAuthGeneration !== authGeneration ||
            state.selectedSongBookId !== songBookId
        ) {
            return false
        }

        await loadSongBookPdfs({ force: true })
        if (
            mutationId !== songMutationId ||
            requestAuthGeneration !== authGeneration ||
            state.selectedSongBookId !== songBookId
        ) {
            return false
        }

        if (state.selectedSongBookId !== songBookId) {
            focusTarget = "book-list"
            return false
        }

        if (collectionLoaded) {
            setNotice("success", "Song deleted.")
        } else {
            setNotice(
                "error",
                "Song deleted, but the song list could not " +
                    "be reloaded. Try Refresh songs."
            )
        }

        focusTarget = collectionLoaded
            ? "after-delete"
            : "refresh"
        return true
    } catch (error) {
        if (
            mutationId !== songMutationId ||
            requestAuthGeneration !== authGeneration ||
            state.selectedSongBookId !== songBookId
        ) {
            return false
        }

        if (await handleMutationAuthorizationFailure(error)) {
            focusTarget = "login"
            return false
        }

        console.error(error)
        if (error instanceof ApiError && error.status === 404) {
            if (state.selectedSongId === id) {
                clearSelection()
            }
            state.pdfSelectedSongs.delete(id)
            renderPdfControls()

            const collectionLoaded = await loadSongs({
                showSuccessNotice: false
            })
            if (state.selectedSongBookId !== songBookId) {
                return false
            }
            await loadSongBookPdfs({ force: true })
            if (state.selectedSongBookId !== songBookId) {
                return false
            }
            if (collectionLoaded) {
                setNotice(
                    "info",
                    "This song was already removed."
                )
            } else {
                setNotice(
                    "error",
                    "This song was already removed, but the " +
                        "song list could not be refreshed. " +
                        "Try Refresh songs."
                )
            }

            focusTarget = collectionLoaded
                ? "after-delete"
                : "refresh"
            return true
        }

        setNotice("error", getDeleteErrorMessage(error))
        return false
    } finally {
        if (mutationId === songMutationId) {
            state.deletingSongId = null
            renderSongList()
            renderCollectionState()
            renderSongDetails()
            renderMutationControls()
            renderNotice()

            if (focusTarget === "after-delete") {
                focusAfterDeletion()
            } else if (focusTarget === "refresh") {
                elements.refreshSongsButton.focus()
            } else if (focusTarget === "login") {
                elements.loginEmail.focus()
            } else if (focusTarget === "book-list") {
                focusSongBookList()
            } else {
                focusDeleteControl(id, triggeredFromDetails, triggerButton)
            }
        }
    }
}

export function renderSongList(songs = state.songs) {
    const writeAccess = canManageSongs()
    const pdfMode = isSongBookAdmin() &&
        state.pdfScope === "selected"
    if (renderedSongs !== songs ||
        renderedSongWriteAccess !== writeAccess ||
        renderedSongPdfMode !== pdfMode) {
        const items = []
        songRows = new Map()

        for (const song of songs) {
            const listItem = document.createElement("li")
            listItem.className = "song-list__item"

            const summary = document.createElement("span")
            summary.className = "song-list__summary"
            const label = formatSongLabel(song)
            summary.textContent = label

            const viewButton = document.createElement("button")
            viewButton.className = "button button--neutral"
            viewButton.type = "button"
            viewButton.dataset.action = "view-song"
            viewButton.dataset.songId = song.id
            viewButton.textContent = "View"
            viewButton.setAttribute("aria-label", `View ${label}`)

            const actions = document.createElement("div")
            actions.className = "song-list__actions"
            actions.appendChild(viewButton)

            let pdfCheckbox = null
            let pdfOption = null
            if (pdfMode) {
                pdfOption = document.createElement("label")
                pdfOption.className = "song-list__pdf-option"
                pdfCheckbox = document.createElement("input")
                pdfCheckbox.type = "checkbox"
                pdfCheckbox.dataset.action = "select-pdf-song"
                pdfCheckbox.dataset.songId = song.id
                pdfCheckbox.checked =
                    state.pdfSelectedSongs.has(song.id)
                pdfCheckbox.disabled = state.isGeneratingPdf
                pdfCheckbox.setAttribute(
                    "aria-label",
                    `Select ${displayValue(
                        song.title,
                        "Untitled song"
                    )} for PDF`
                )
                pdfOption.appendChild(pdfCheckbox)
                pdfOption.appendChild(
                    document.createTextNode("Select for PDF")
                )
            }

            let deleteButton = null
            if (writeAccess) {
                deleteButton = document.createElement("button")
                deleteButton.className = "button button--destructive"
                deleteButton.type = "button"
                deleteButton.dataset.action = "delete-song"
                deleteButton.dataset.songId = song.id
                deleteButton.textContent = "Delete"
                deleteButton.setAttribute(
                    "aria-label",
                    `Delete ${getDeletionSongName(song.id, song)}`
                )
                actions.appendChild(deleteButton)
            }

            listItem.appendChild(summary)
            if (pdfOption !== null) {
                listItem.appendChild(pdfOption)
            }
            listItem.appendChild(actions)
            items.push(listItem)
            songRows.set(song.id, {
                listItem,
                viewButton,
                deleteButton,
                pdfCheckbox,
                song
            })
        }

        elements.songList.replaceChildren(...items)
        renderedSongs = songs
        renderedSongWriteAccess = writeAccess
        renderedSongPdfMode = pdfMode
        renderedSongSelection = null
        renderedSongSaving = null
        renderedSongDeletion = null
    }

    if (renderedSongSelection !== state.selectedSongId) {
        for (const id of [
            renderedSongSelection,
            state.selectedSongId
        ]) {
            const row = songRows.get(id)
            if (row === undefined) {
                continue
            }

            const selected = id === state.selectedSongId
            row.listItem.className = selected
                ? "song-list__item song-list__item--selected"
                : "song-list__item"
            if (selected) {
                row.viewButton.setAttribute("aria-current", "true")
            } else {
                row.viewButton.removeAttribute("aria-current")
            }
        }
        renderedSongSelection = state.selectedSongId
    }

    if (
        renderedSongSaving !== state.isSaving ||
        renderedSongDeletion !== state.deletingSongId
    ) {
        for (const [id, row] of songRows) {
            row.viewButton.disabled = state.isSaving
            if (row.deleteButton !== null) {
                row.deleteButton.disabled =
                    state.isSaving || state.deletingSongId === id
            }
            if (row.pdfCheckbox !== null) {
                row.pdfCheckbox.disabled =
                    state.isGeneratingPdf ||
                    state.isSaving ||
                    state.deletingSongId !== null
            }
        }
        renderedSongSaving = state.isSaving
        renderedSongDeletion = state.deletingSongId
    }

    const selected = songRows.get(state.selectedSongId)
    if (selected?.deleteButton) {
        selected.deleteButton.setAttribute(
            "aria-label",
            `Delete ${getDeletionSongName(
                state.selectedSongId,
                selected.song
            )}`
        )
    }
}

export function renderSongDetails() {
    elements.songDetails.setAttribute(
        "aria-busy",
        String(state.isLoadingSong)
    )
    elements.songDetails.replaceChildren()

    if (state.isLoadingSong) {
        renderDetailsState("Loading song details...")
        return
    }

    if (state.selectedSongBookId === null) {
        renderDetailsState("Select a song book to view its songs.")
        return
    }

    if (state.selectedSongId === null) {
        renderDetailsState("Select a song to view its details.")
        return
    }

    if (state.selectedSong === null) {
        renderDetailsState(
            "Song details could not be loaded. " +
            "Use View to try again."
        )
        return
    }

    const heading = document.createElement("h3")
    heading.id = "selected-song-heading"
    heading.className = "song-details__heading"
    heading.dataset.songId = state.selectedSongId
    heading.setAttribute("tabindex", "-1")
    heading.textContent = `Song details: ${displayValue(
        state.selectedSong.title,
        "Untitled song"
    )}`

    const values = document.createElement("dl")
    values.className = "song-details__values"
    appendDetailValue(values, "Title", state.selectedSong.title)
    appendDetailValue(values, "Author", state.selectedSong.author)
    appendDetailValue(
        values,
        "Original title",
        state.selectedSong.originalTitle
    )
    appendDetailValue(values, "Number", state.selectedSong.number)
    appendDetailValue(values, "Key", state.selectedSong.key)
    appendDetailValue(values, "Tempo", state.selectedSong.tempo)

    const partsSection = document.createElement("section")
    partsSection.className = "song-details__parts"

    const partsHeading = document.createElement("h4")
    partsHeading.textContent = "Parts"
    partsSection.appendChild(partsHeading)

    const hasChords = Array.isArray(state.selectedSong.parts) &&
        state.selectedSong.parts.some(part => part.chords?.length > 0)
    if (hasChords) {
        const toggle = document.createElement("div")
        toggle.className = "checkbox-field song-details__chord-toggle"
        const checkbox = document.createElement("input")
        checkbox.id = "show-song-chords"
        checkbox.type = "checkbox"
        checkbox.checked = state.showChords
        checkbox.addEventListener("change", event => {
            state.showChords = event.currentTarget.checked
            renderSongDetails()
            findDescendant(elements.songDetails, element =>
                element.id === "show-song-chords"
            )?.focus()
        })
        const label = document.createElement("label")
        label.setAttribute("for", checkbox.id)
        label.textContent = "Show chords"
        toggle.appendChild(checkbox)
        toggle.appendChild(label)
        partsSection.appendChild(toggle)
    }
    renderSongParts(
        partsSection,
        state.selectedSong.parts,
        hasChords && state.showChords
    )

    if (canManageSongs()) {
        const editButton = document.createElement("button")
        editButton.className = "button button--primary"
        editButton.type = "button"
        editButton.disabled =
            state.isSaving || isSelectedSongDeleting()
        editButton.textContent = "Edit song"
        editButton.dataset.action = "edit-song"
        editButton.dataset.songId = state.selectedSongId
        editButton.setAttribute(
            "aria-label",
            `Edit ${getDeletionSongName(state.selectedSongId)}`
        )
        editButton.addEventListener("click", beginEditSong)

        const deleteButton = document.createElement("button")
        deleteButton.className = "button button--destructive"
        deleteButton.type = "button"
        deleteButton.dataset.action = "delete-song"
        deleteButton.dataset.songId = state.selectedSongId
        deleteButton.disabled =
            state.isSaving ||
            state.deletingSongId === state.selectedSongId
        deleteButton.textContent = "Delete"
        deleteButton.setAttribute(
            "aria-label",
            `Delete ${getDeletionSongName(state.selectedSongId)}`
        )
        deleteButton.addEventListener(
            "click",
            event => requestSongDeletion(
                event.currentTarget.dataset.songId,
                event.currentTarget
            )
        )

        const actions = document.createElement("div")
        actions.className = "song-details__actions"
        actions.appendChild(editButton)
        actions.appendChild(deleteButton)
        elements.songDetails.appendChild(heading)
        elements.songDetails.appendChild(values)
        elements.songDetails.appendChild(partsSection)
        elements.songDetails.appendChild(actions)
        return
    }

    elements.songDetails.appendChild(heading)
    elements.songDetails.appendChild(values)
    elements.songDetails.appendChild(partsSection)
}

export function renderAuth() {
    const authenticated = isAuthenticated()
    const anonymous = state.auth.status === "anonymous"
    const roleLabel = state.auth.role === "superuser"
        ? " (SuperUser)"
        : state.auth.role === "moderator"
            ? " (Moderator)"
            : ""

    elements.authSummary.textContent = state.auth.status === "loading"
        ? "Checking session..."
        : authenticated
            ? `Signed in as ${state.auth.email ?? "account user"}${roleLabel}.`
            : authLoadFailed
                ? "Session unavailable. Private song books are hidden."
                : "Not signed in."
    elements.showLoginButton.hidden = !anonymous
    elements.showRegisterButton.hidden = !anonymous
    elements.logoutButton.hidden = !authenticated
    elements.manageUsersButton.hidden = !canModerateUsers()
    elements.showLoginButton.disabled = state.isAuthPending
    elements.showRegisterButton.disabled = state.isAuthPending
    elements.logoutButton.disabled = state.isAuthPending
    elements.manageUsersButton.disabled =
        state.isAuthPending || state.showUserManagement
    elements.authPanel.hidden = state.authView === "none"
    elements.authPanel.setAttribute(
        "aria-busy",
        String(state.isAuthPending)
    )

    const forms = new Map([
        ["login", elements.loginForm],
        ["register", elements.registerForm],
        ["resend-confirmation", elements.resendConfirmationForm],
        ["forgot-password", elements.forgotPasswordForm],
        ["reset-password", elements.resetPasswordForm]
    ])
    const headings = new Map([
        ["login", "Sign in"],
        ["register", "Register"],
        ["resend-confirmation", "Resend confirmation"],
        ["forgot-password", "Forgot password"],
        ["reset-password", "Reset password"]
    ])

    for (const [view, form] of forms) {
        form.hidden = state.authView !== view

        for (const control of Array.from(form.elements)) {
            control.disabled = state.isAuthPending
        }
    }

    elements.closeAuthPanelButton.disabled = state.isAuthPending
    elements.authPanelHeading.textContent =
        headings.get(state.authView) ?? "Account"
    elements.newSongButton.hidden = !canManageSongs()
    elements.writeAccessMessage.hidden =
        canManageSongs() || state.auth.status === "loading"
    renderSongBookControls()
}

export function renderUserManagement() {
    const active = state.showUserManagement && canModerateUsers()
    const busy = state.isLoadingManagedUsers ||
        state.mutatingManagedUserId !== null
    const rebuild = renderedUsers !== state.managedUsers ||
        renderedUserRole !== state.auth.role ||
        renderedUserPanel !== active
    renderUserPageControls()
    elements.moderationPanel.hidden = !active
    elements.songActions.hidden = active
    elements.songBooksPanel.hidden = active
    elements.songBookContent.hidden = active
    elements.moderationList.setAttribute("aria-busy", String(busy))
    elements.refreshManagedUsersButton.disabled = busy
    elements.closeModerationButton.disabled =
        state.mutatingManagedUserId !== null
    if (rebuild) {
        elements.moderationList.replaceChildren()
        renderedUsers = state.managedUsers
        renderedUserRole = state.auth.role
        renderedUserPanel = active
        renderedUserBusy = null
    }

    if (!active) {
        elements.moderationListState.textContent = ""
        return
    }

    if (state.isLoadingManagedUsers) {
        elements.moderationListState.textContent =
            "Loading users..."
    } else if (managedUserListLoadFailed) {
        elements.moderationListState.textContent =
            "Users could not be loaded. Try Refresh users."
    } else if (state.managedUsers.length === 0) {
        elements.moderationListState.textContent =
            state.managedUserPage === 1
                ? "No other users."
                : "No users on this page. Go to a previous page."
    } else {
        elements.moderationListState.textContent = ""
    }

    if (rebuild) {
        for (const user of state.managedUsers) {
            const item = document.createElement("li")
            item.className = "moderation-list__item"

            const summary = document.createElement("span")
            summary.className = "moderation-list__summary"
            const email = document.createElement("strong")
            email.textContent = displayValue(
                user.email,
                "Account without email"
            )
            const status = document.createElement("span")
            status.textContent = `${user.role === "superuser"
                ? "SuperUser"
                : user.role === "moderator"
                    ? "Moderator"
                    : "User"} - ${user.isBanned
                ? "Banned"
                : user.emailConfirmed
                    ? "Active"
                    : "Unconfirmed"}`
            summary.appendChild(email)
            summary.appendChild(status)
            item.appendChild(summary)

            const canManageTarget = user.role !== "superuser" &&
                (
                    state.auth.role === "superuser" ||
                    user.role === "user"
                )

            if (canManageTarget) {
                const actions = document.createElement("div")
                actions.className = "moderation-list__actions"

                if (state.auth.role === "superuser" &&
                    (
                        user.role === "moderator" ||
                        (!user.isBanned && user.emailConfirmed)
                    )) {
                    const roleButton = document.createElement("button")
                    roleButton.className = "button button--neutral"
                    roleButton.type = "button"
                    roleButton.dataset.action = user.role === "moderator"
                        ? "remove-moderator"
                        : "grant-moderator"
                    roleButton.dataset.userId = user.id
                    roleButton.textContent = user.role === "moderator"
                        ? "Remove moderator"
                        : "Make moderator"
                    roleButton.disabled = busy
                    roleButton.setAttribute(
                        "aria-label",
                        `${roleButton.textContent}: ${email.textContent}`
                    )
                    actions.appendChild(roleButton)
                }

                const banButton = document.createElement("button")
                banButton.className = user.isBanned
                    ? "button button--neutral"
                    : "button button--destructive"
                banButton.type = "button"
                banButton.dataset.action = user.isBanned
                    ? "unban-user"
                    : "ban-user"
                banButton.dataset.userId = user.id
                banButton.textContent = user.isBanned ? "Unban" : "Ban"
                banButton.disabled = busy
                banButton.setAttribute(
                    "aria-label",
                    `${banButton.textContent}: ${email.textContent}`
                )
                actions.appendChild(banButton)

                const deleteButton = document.createElement("button")
                deleteButton.className = "button button--destructive"
                deleteButton.type = "button"
                deleteButton.dataset.action = "delete-user"
                deleteButton.dataset.userId = user.id
                deleteButton.textContent = "Delete user"
                deleteButton.disabled = busy
                deleteButton.setAttribute(
                    "aria-label",
                    `Delete user: ${email.textContent}`
                )
                actions.appendChild(deleteButton)
                item.appendChild(actions)
            }

            elements.moderationList.appendChild(item)
        }
    }

    if (renderedUserBusy !== busy) {
        for (const button of findDescendants(
            elements.moderationList,
            element => element.tagName === "BUTTON"
        )) {
            button.disabled = busy
        }
        renderedUserBusy = busy
    }
}

export function renderCollectionState() {
    renderSongPageControls()
    elements.refreshSongsButton.disabled =
        state.isLoadingSongs ||
        state.selectedSongBookId === null ||
        !isAuthenticated()
    elements.songList.setAttribute(
        "aria-busy",
        String(state.isLoadingSongs)
    )
    elements.songListState.hidden = false

    if (state.isLoadingSongs) {
        elements.songListState.textContent = "Loading songs..."
        return
    }

    if (!isAuthenticated()) {
        elements.songListState.textContent =
            "Sign in to view private songs."
        return
    }

    if (state.selectedSongBookId === null) {
        elements.songListState.textContent = "Select a song book."
        return
    }

    if (
        state.isLoadingSongBook &&
        state.selectedSongBook === null
    ) {
        elements.songListState.textContent =
            "Loading the selected song book..."
        return
    }

    if (collectionLoadFailed && state.songs.length === 0) {
        elements.songListState.textContent = "Songs could not be loaded."
        return
    }

    if (state.songs.length === 0) {
        elements.songListState.textContent =
            state.songPage > 1
                ? "No songs on this page. Go to a previous page."
                : canManageSongs()
                    ? "No songs yet. Create the first one."
                    : "No songs yet."
        return
    }

    elements.songListState.textContent = ""
    elements.songListState.hidden = true
}

export function renderNotice() {
    elements.appStatus.className = "notice"
    elements.appStatus.setAttribute("role", "status")
    elements.appStatus.setAttribute("aria-live", "polite")
    elements.appStatus.textContent = ""

    if (state.notice === null) {
        return
    }

    if (state.notice.type === "error") {
        elements.appStatus.setAttribute("role", "alert")
        elements.appStatus.setAttribute("aria-live", "assertive")
    }

    elements.appStatus.className =
        `notice notice--${state.notice.type}`
    elements.appStatus.textContent = state.notice.message
}

function openEditor(heading, submitLabel) {
    elements.songFormHeading.textContent = heading
    elements.saveSongButton.textContent = submitLabel
    elements.songForm.hidden = false
    elements.songDetails.hidden = true
    renderDraftParts()
    renderMutationControls()
    elements.songTitle.focus()
}

function closeEditor() {
    state.editorMode = "idle"
    state.draftParts = []
    populateSongForm(elements.songForm)
    renderPartsEditor(elements.partsEditor, state.draftParts)
    elements.songFormHeading.textContent = "Song editor"
    elements.saveSongButton.textContent = "Save song"
    elements.songForm.hidden = true
    elements.songDetails.hidden = false
}

function addPart() {
    if (
        state.isSaving ||
        isSelectedSongDeleting() ||
        state.editorMode === "idle"
    ) {
        return
    }

    const draftPart = createPartDraft()
    state.draftParts.push(draftPart)
    renderDraftParts()
    findPartControl(draftPart.clientKey, "name")?.focus()
}

function rememberPartTextEdit(event) {
    if (event.target.dataset?.partField !== "text") {
        return
    }

    const draftPart = state.draftParts.find(
        part => part.clientKey === event.target.dataset.partKey
    )
    if (draftPart !== undefined) {
        draftPart.pendingTextEdit = {
            start: event.target.selectionStart,
            end: event.target.selectionEnd,
            inputType: event.inputType
        }
    }
}

function updatePartDraft(event) {
    if (isSelectedSongDeleting()) {
        return
    }

    const partKey = event.target.dataset?.partKey
    const partField = event.target.dataset?.partField

    if (
        partKey === undefined ||
        (partField !== "name" &&
            partField !== "text" &&
            partField !== "chord")
    ) {
        return
    }

    const draftPart = state.draftParts.find(
        part => part.clientKey === partKey
    )

    if (draftPart === undefined) {
        return
    }

    if (partField === "name") {
        draftPart.name = event.target.value
        return
    }
    if (partField === "chord") {
        draftPart.chordInput = event.target.value
        return
    }

    const previousText = draftPart.text
    const nextText = event.target.value
    if (previousText !== nextText) {
        if (draftPart.chords?.length > 0) {
            const changed = adjustChordsForTextEdit(
                draftPart.chords,
                previousText,
                nextText,
                draftPart.pendingTextEdit
            )
            draftPart.chords = changed.chords
            draftPart.chordsEdited = true
            draftPart.chordMessage = changed.removedCount > 0
                ? `${changed.removedCount} chord${changed.removedCount === 1
                    ? " was"
                    : "s were"} removed because the anchored lyric changed.`
                : ""
        } else {
            draftPart.chordMessage = ""
        }
    }
    draftPart.text = nextText
    draftPart.pendingTextEdit = null
    draftPart.selectedOffset = isChordAnchor(
        nextText, event.target.selectionStart
    ) ? event.target.selectionStart : null
    refreshChordEditor(draftPart)
}

function updateChordCursor(event) {
    if (event.target.dataset?.partField !== "text") {
        return
    }

    const draftPart = state.draftParts.find(
        part => part.clientKey === event.target.dataset.partKey
    )
    if (draftPart === undefined) {
        return
    }

    const offset = event.target.selectionStart
    draftPart.selectedOffset = isChordAnchor(draftPart.text, offset)
        ? offset
        : null
    draftPart.chordMessage = ""
    refreshChordEditor(draftPart)
}

function handleChordKeydown(event) {
    if (event.key !== "Enter" ||
        event.target.dataset?.partField !== "chord") {
        return
    }

    event.preventDefault()
    if (state.isSaving || isSelectedSongDeleting()) {
        return
    }

    const partKey = event.target.dataset.partKey
    const draftPart = state.draftParts.find(
        part => part.clientKey === partKey
    )
    if (draftPart !== undefined) {
        setPartChord(draftPart, partKey)
    }
}

function handlePartAction(event) {
    if (state.isSaving || isSelectedSongDeleting()) {
        return
    }

    if (event.target.dataset?.partField === "text") {
        updateChordCursor(event)
        return
    }

    const action = event.target.dataset?.action
    const partKey = event.target.dataset?.partKey

    if (action === undefined || partKey === undefined) {
        return
    }

    const partIndex = state.draftParts.findIndex(
        part => part.clientKey === partKey
    )

    if (partIndex === -1) {
        return
    }

    const draftPart = state.draftParts[partIndex]
    if (action === "set-chord") {
        setPartChord(draftPart, partKey)
        return
    }

    if (action === "remove-chord") {
        draftPart.chords = (draftPart.chords ?? []).filter(
            chord => chord.offset !== draftPart.selectedOffset
        )
        draftPart.chordsEdited = true
        draftPart.chordMessage = ""
        refreshChordEditor(draftPart)
        findPartControl(partKey, "chord")?.focus()
        return
    }

    if (action === "select-chord") {
        const offset = Number(event.target.dataset.offset)
        const chord = draftPart.chords?.find(
            item => item.offset === offset
        )
        if (chord === undefined) {
            draftPart.chordMessage =
                "That chord is no longer attached to this part."
        } else {
            draftPart.selectedOffset = offset
            draftPart.chordMessage = ""
            draftPart.chordInput = chord.symbol
            findPartControl(partKey, "chord").value = chord.symbol
            findPartControl(partKey, "chord").focus()
        }
        refreshChordEditor(draftPart)
        return
    }

    if (action === "remove-part") {
        state.draftParts.splice(partIndex, 1)
        renderDraftParts()
        return
    }

    const targetIndex = action === "move-part-up"
        ? partIndex - 1
        : action === "move-part-down"
            ? partIndex + 1
            : partIndex

    if (
        targetIndex < 0 ||
        targetIndex >= state.draftParts.length ||
        targetIndex === partIndex
    ) {
        return
    }

    const [movedPart] = state.draftParts.splice(partIndex, 1)
    state.draftParts.splice(targetIndex, 0, movedPart)
    renderDraftParts()
}

function setPartChord(draftPart, partKey) {
    const input = findPartControl(partKey, "chord")
    draftPart.chordInput = input.value
    const symbol = input.value.trim()
    if (!isChordAnchor(draftPart.text, draftPart.selectedOffset)) {
        draftPart.chordMessage =
            "Place the cursor before a lyric character, not a line break."
        findPartControl(partKey, "text")?.focus()
    } else if (symbol.length === 0 || symbol.length > 64) {
        draftPart.chordMessage =
            "Enter a chord symbol of 1 to 64 characters."
        input.focus()
    } else {
        draftPart.chords = (draftPart.chords ?? []).filter(
            chord => chord.offset !== draftPart.selectedOffset
        )
        draftPart.chords.push({
            offset: draftPart.selectedOffset,
            symbol
        })
        draftPart.chords.sort((a, b) => a.offset - b.offset)
        draftPart.chordsEdited = true
        draftPart.chordMessage = ""
        draftPart.chordInput = ""
        input.value = ""
        input.focus()
    }
    refreshChordEditor(draftPart)
}

function renderDraftParts() {
    renderPartsEditor(elements.partsEditor, state.draftParts)
    renderMutationControls()
}

function refreshChordEditor(draftPart) {
    const fieldset = Array.from(elements.partsEditor.children).find(
        item => item.dataset.partKey === draftPart.clientKey
    )
    if (fieldset !== undefined) {
        renderChordEditor(fieldset, draftPart)
    }
}

function renderMutationControls() {
    renderSongPageControls()
    const formBusy = state.isSaving || isSelectedSongDeleting()
    const formLocked =
        formBusy ||
        (state.editorMode !== "idle" && !canManageSongs())
    elements.newSongButton.hidden = !canManageSongs()
    elements.newSongButton.disabled =
        state.isSaving ||
        state.songBookFormMode !== "idle" ||
        state.isSavingSongBook ||
        !canManageSongs()
    elements.refreshSongsButton.disabled =
        state.isLoadingSongs ||
        state.selectedSongBookId === null ||
        !isAuthenticated()
    elements.songFormStatus.textContent = getFormBusyMessage()
    elements.songForm.setAttribute(
        "aria-busy",
        String(formBusy)
    )

    for (const control of Array.from(elements.songForm.elements)) {
        if (formLocked) {
            if (control.dataset.disabledBeforeMutation === undefined) {
                control.dataset.disabledBeforeMutation =
                    String(control.disabled)
            }

            control.disabled = true
            continue
        }

        if (control.dataset.disabledBeforeMutation !== undefined) {
            control.disabled =
                control.dataset.disabledBeforeMutation === "true"
            delete control.dataset.disabledBeforeMutation
        }
    }

    renderSongBookControls()
}

function renderSongBookControls() {
    renderBookPageControls()
    renderMemberPageControls()
    const authenticated = isAuthenticated()
    const savingBook = state.isSavingSongBook
    const savingAccess = state.isSavingSongBookAccess
    const songMutationPending =
        state.isSaving || state.deletingSongId !== null
    const bookSelectionBlocked =
        songMutationPending ||
        state.isLoadingSongs ||
        savingAccess
    const admin = isSongBookAdmin()

    elements.newSongBookButton.hidden = !authenticated
    elements.refreshSongBooksButton.hidden = !authenticated
    elements.newSongBookButton.disabled =
        !authenticated ||
        savingBook ||
        bookSelectionBlocked ||
        state.editorMode !== "idle" ||
        state.songBookFormMode !== "idle"
    elements.refreshSongBooksButton.disabled =
        !authenticated ||
        state.isLoadingSongBooks ||
        savingBook ||
        bookSelectionBlocked
    elements.songBookForm.hidden =
        state.songBookFormMode === "idle"
    elements.songBookForm.setAttribute(
        "aria-busy",
        String(savingBook)
    )

    for (const control of Array.from(elements.songBookForm.elements)) {
        control.disabled = savingBook || songMutationPending
    }

    elements.renameSongBookButton.hidden = !admin
    elements.deleteSongBookButton.hidden = !admin
    elements.renameSongBookButton.disabled =
        !admin ||
        savingBook ||
        bookSelectionBlocked ||
        state.songBookFormMode !== "idle"
    elements.deleteSongBookButton.disabled =
        !admin ||
        savingBook ||
        bookSelectionBlocked ||
        state.songBookFormMode !== "idle"

    elements.songBookAccessForm.setAttribute(
        "aria-busy",
        String(savingAccess)
    )

    for (
        const control of
        Array.from(elements.songBookAccessForm.elements)
    ) {
        control.disabled =
            !admin ||
            savingAccess ||
            songMutationPending ||
            state.isLoadingSongBookMembers
    }

    for (const button of findDescendants(
        elements.songBookAccessList,
        element => element.tagName === "BUTTON"
    )) {
        button.disabled = savingAccess || songMutationPending
    }

    renderPdfControls()
}

function renderBookPageControls() {
    renderPageControls(elements.bookPagination, {
        page: state.songBookPage,
        hasNext: state.songBookHasNext,
        busy: state.isLoadingSongBooks ||
            state.isLoadingSongBook ||
            state.isLoadingSongs ||
            state.isSavingSongBook ||
            state.isSavingSongBookAccess ||
            state.isSaving ||
            state.deletingSongId !== null,
        available: isAuthenticated()
    })
}

function renderSongPageControls() {
    renderPageControls(elements.songPagination, {
        page: state.songPage,
        hasNext: state.songHasNext,
        busy: state.isLoadingSongs ||
            state.isSaving ||
            state.deletingSongId !== null,
        available: isAuthenticated() &&
            state.selectedSongBookId !== null
    })
}

function renderMemberPageControls() {
    renderPageControls(elements.memberPagination, {
        page: state.memberPage,
        hasNext: state.memberHasNext,
        busy: state.isLoadingSongBookMembers ||
            state.isSavingSongBookAccess ||
            state.isSaving ||
            state.deletingSongId !== null,
        available: isSongBookAdmin()
    })
}

function renderUserPageControls() {
    renderPageControls(elements.userPagination, {
        page: state.managedUserPage,
        hasNext: state.managedUserHasNext,
        busy: state.isLoadingManagedUsers ||
            state.mutatingManagedUserId !== null,
        available: state.showUserManagement && canModerateUsers()
    })
}

function findPartControl(clientKey, fieldName) {
    return findDescendant(
        elements.partsEditor,
        element =>
            element.dataset?.partKey === clientKey &&
            element.dataset?.partField === fieldName
    )
}

function findDescendants(container, predicate) {
    const matches = []

    for (const child of container.children ?? []) {
        if (predicate(child)) {
            matches.push(child)
        }

        matches.push(...findDescendants(child, predicate))
    }

    return matches
}

function findDescendant(container, predicate) {
    for (const child of container.children ?? []) {
        if (predicate(child)) {
            return child
        }

        const match = findDescendant(child, predicate)

        if (match !== null) {
            return match
        }
    }

    return null
}

function renderDetailsState(message) {
    const status = document.createElement("p")
    status.className = "song-details__state"
    status.textContent = message
    elements.songDetails.appendChild(status)
}

function appendDetailValue(container, label, value) {
    const field = document.createElement("div")
    field.className = "song-details__field"

    const term = document.createElement("dt")
    term.textContent = label

    const description = document.createElement("dd")
    description.textContent = displayValue(value)

    field.appendChild(term)
    field.appendChild(description)
    container.appendChild(field)
}

function renderSongParts(container, parts, showChords = false) {
    if (!Array.isArray(parts) || parts.length === 0) {
        const emptyState = document.createElement("p")
        emptyState.textContent = "No parts"
        container.appendChild(emptyState)
        return
    }

    const partList = document.createElement("ol")
    partList.className = "song-parts"

    for (const part of parts) {
        const partItem = document.createElement("li")
        partItem.className = "song-part"

        const partName = document.createElement("h5")
        partName.textContent = displayValue(part.name, "Unnamed part")

        const partText = document.createElement("div")
        partText.className = "song-part__text"
        if (showChords && part.chords?.length > 0) {
            partText.className += " chorded-text"
            renderChordedText(partText, part.text ?? "", part.chords)
        } else {
            partText.textContent = part.text === null ||
                part.text === undefined ||
                part.text === ""
                ? "Not provided"
                : String(part.text)
        }

        partItem.appendChild(partName)
        partItem.appendChild(partText)
        partList.appendChild(partItem)
    }

    container.appendChild(partList)
}

function formatSongLabel(song) {
    const labelParts = []

    if (hasDisplayValue(song.number)) {
        labelParts.push(`${song.number}.`)
    }

    labelParts.push(displayValue(song.title, "Untitled song"))

    if (hasDisplayValue(song.author)) {
        labelParts.push(`— ${song.author}`)
    }

    return labelParts.join(" ")
}

function displayValue(value, fallback = "Not provided") {
    return hasDisplayValue(value) ? String(value) : fallback
}

function hasDisplayValue(value) {
    return value !== null &&
        value !== undefined &&
        String(value).trim() !== ""
}

function isSelectedSongDeleting() {
    return state.deletingSongId !== null &&
        state.deletingSongId === state.selectedSongId
}

function getDeletionSongName(id, summary = null) {
    const song = state.selectedSong?.id === id
        ? state.selectedSong
        : summary ?? state.songs.find(item => item.id === id) ?? null
    const title = song?.title
    return hasDisplayValue(title)
        ? String(title).trim()
        : "untitled song"
}

function getDeleteErrorMessage(error) {
    if (error instanceof ApiError && error.status === null) {
        return "Could not reach the SongBook API. " +
            "The song was not deleted. Try again."
    }

    if (error instanceof ApiError && error.status === 400) {
        return "The API rejected the delete request. " +
            "The song was not deleted. Try again."
    }

    if (
        error instanceof ApiError &&
        error.status !== null &&
        error.status >= 500
    ) {
        return "The server could not delete the song. " +
            "The song remains available. Try again."
    }

    return "Could not delete the song. Try again."
}

function getFormBusyMessage() {
    if (state.isSaving) {
        return state.editorMode === "create"
            ? "Form controls are disabled while the song is being created."
            : "Form controls are disabled while changes are being saved."
    }

    if (isSelectedSongDeleting()) {
        return "Form controls are disabled while the selected song " +
            "is being deleted."
    }

    if (state.editorMode !== "idle" && !canManageSongs()) {
        return "Editor access is required to save this draft. " +
            "The entered data is preserved."
    }

    return ""
}

function focusAfterEditorCancel(cancelledMode) {
    if (cancelledMode === "create") {
        elements.newSongButton.focus()
        return
    }

    if (cancelledMode === "edit") {
        const editButton = findDescendant(
            elements.songDetails,
            element =>
                element.dataset?.action === "edit-song" &&
                element.dataset?.songId === state.selectedSongId
        )

        if (editButton !== null) {
            editButton.focus()
            return
        }
    }

    focusSongListHeading()
}

function focusSelectedSong(id) {
    const heading = findDescendant(
        elements.songDetails,
        element =>
            element.className === "song-details__heading" &&
            element.dataset?.songId === id
    )

    if (heading !== null) {
        heading.focus()
        return
    }

    const viewButton = findDescendant(
        elements.songList,
        element =>
            element.dataset?.action === "view-song" &&
            element.dataset?.songId === id
    )

    if (viewButton !== null) {
        viewButton.focus()
        return
    }

    focusSongListHeading()
}

function focusSongListHeading() {
    elements.songListHeading.focus()
}

function focusAfterDeletion() {
    const firstViewButton = findDescendant(
        elements.songList,
        element => element.dataset?.action === "view-song"
    )

    if (firstViewButton !== null) {
        firstViewButton.focus()
        return
    }

    elements.newSongButton.focus()
}

function focusDeleteControl(id, fromDetails, fallbackControl) {
    const preferredContainer = fromDetails
        ? elements.songDetails
        : elements.songList
    const alternateContainer = fromDetails
        ? elements.songList
        : elements.songDetails
    const deleteControl =
        findDeleteControl(preferredContainer, id) ??
        findDeleteControl(alternateContainer, id) ??
        fallbackControl
    deleteControl?.focus()
}

function findDeleteControl(container, id) {
    return findDescendant(
        container,
        element =>
            element.dataset?.action === "delete-song" &&
            element.dataset?.songId === id
    )
}

function isDescendantOf(container, element) {
    let currentElement = element

    while (currentElement !== null) {
        if (currentElement === container) {
            return true
        }

        currentElement = currentElement.parentNode
    }

    return false
}

function isAuthenticated() {
    return state.auth.status === "authenticated"
}

function canModerateUsers() {
    return isAuthenticated() &&
        ["moderator", "superuser"].includes(state.auth.role)
}

function normalizeAccessLevel(value) {
    const normalized = String(value ?? "").trim().toLowerCase()
    return ["admin", "editor", "reader"].includes(normalized)
        ? normalized
        : null
}

function formatAccessLevel(value) {
    const normalized = normalizeAccessLevel(value)

    if (normalized === null) {
        return "Unknown access"
    }

    return normalized[0].toUpperCase() + normalized.slice(1)
}

function isSongBookAdmin() {
    return isAuthenticated() &&
        state.selectedSongBookAccessLevel === "admin"
}

function canManageSongs() {
    return isAuthenticated() &&
        ["admin", "editor"].includes(
            state.selectedSongBookAccessLevel
        )
}

function canReadSongBookPdfs() {
    return isAuthenticated() &&
        state.selectedSongBookId !== null &&
        state.selectedSongBook !== null &&
        ["admin", "editor", "reader"].includes(
            state.selectedSongBookAccessLevel
        )
}

function focusAuthView(view) {
    const focusTarget = new Map([
        ["login", elements.loginEmail],
        ["register", elements.registerEmail],
        ["resend-confirmation", elements.resendConfirmationEmail],
        ["forgot-password", elements.forgotPasswordEmail],
        ["reset-password", elements.resetPasswordNewPassword]
    ]).get(view)

    focusTarget?.focus()
}

function closeSongBookEditor() {
    state.songBookFormMode = "idle"
    elements.songBookName.value = ""
    elements.songBookFormHeading.textContent = "Song-book editor"
    elements.saveSongBookButton.textContent = "Save song book"
    elements.songBookForm.hidden = true
}

function clearSongState({ preserveEditor = false } = {}) {
    songCollectionRequestId += 1
    cancelSongDetailRequest()
    songMutationId += 1

    if (!preserveEditor && state.editorMode !== "idle") {
        closeEditor()
    }

    state.songs = []
    state.songPage = 1
    state.songHasNext = false
    state.selectedSongId = null
    state.selectedSong = null
    state.isLoadingSongs = false
    state.isLoadingSong = false
    state.isSaving = false
    state.deletingSongId = null
    collectionLoadFailed = false
}

function clearSelectedSongBook({ preserveEditor = false } = {}) {
    songBookSelectionRequestId += 1
    songBookMembersRequestId += 1
    songBookAccessMutationId += 1
    pdfListRequestId += 1
    pdfMutationId += 1
    pdfDownloadRequestId += 1
    clearSongState({ preserveEditor })
    state.selectedSongBookId = null
    state.selectedSongBook = null
    state.selectedSongBookAccessLevel = null
    state.songBookMembers = []
    state.memberPage = 1
    state.memberHasNext = false
    state.isLoadingSongBook = false
    state.isLoadingSongBookMembers = false
    state.isSavingSongBookAccess = false
    songBookMembersLoadFailed = false
    state.songBookPdfs = []
    state.pdfPage = 1
    state.pdfHasNext = false
    state.pdfScope = "whole"
    state.pdfSelectedSongs = new Map()
    state.isLoadingPdfs = false
    state.isGeneratingPdf = false
    state.downloadingPdfId = null
    pdfListLoadFailed = false
    elements.songBookPdfIncludeChords.checked = true
    elements.songBookAccessEmail.value = ""
    elements.songBookAccessLevel.value = "reader"
}

function updateSelectedBookAccess(book) {
    state.selectedSongBook = book
    state.selectedSongBookAccessLevel =
        normalizeAccessLevel(book?.accessLevel)
    if (!isSongBookAdmin()) {
        songBookMembersRequestId += 1
        state.songBookMembers = []
        state.memberPage = 1
        state.memberHasNext = false
        state.isLoadingSongBookMembers = false
        songBookMembersLoadFailed = false
        state.pdfScope = "whole"
        state.pdfSelectedSongs = new Map()
    }

    renderSelectedSongBook()
    renderSongBookMembers()
    renderSongList()
    renderMutationControls()
}

function clearPrivateState({ preserveEditor = false } = {}) {
    songBookListRequestId += 1
    songBookMutationId += 1
    state.songBooks = []
    state.songBookPage = 1
    state.songBookHasNext = false
    state.isLoadingSongBooks = false
    state.isSavingSongBook = false
    songBookListLoadFailed = false
    closeSongBookEditor()
    clearSelectedSongBook({ preserveEditor })
    clearUserManagement()
}

function renderPrivateState() {
    renderUserManagement()
    renderSongBookList()
    renderSongBookState()
    renderSelectedSongBook()
    renderSongBookMembers()
    renderSongList()
    renderCollectionState()
    renderSongDetails()
    renderMutationControls()
}

function upsertSongBookSummary(songBook) {
    if (
        songBook === null ||
        typeof songBook !== "object" ||
        songBook.id === undefined ||
        songBook.id === null
    ) {
        throw new ApiError(
            "The API returned an invalid song-book response."
        )
    }

    const index = state.songBooks.findIndex(
        candidate => candidate.id === songBook.id
    )

    if (index === -1) {
        state.songBooks = [...state.songBooks, songBook]
    } else {
        state.songBooks = state.songBooks.map((candidate, position) =>
            position === index
                ? { ...candidate, ...songBook }
                : candidate
        )
    }
}

function upsertSongBookMember(member) {
    if (
        member === null ||
        typeof member !== "object" ||
        member.id === undefined ||
        member.id === null ||
        typeof member.email !== "string" ||
        !["reader", "editor"].includes(
            normalizeAccessLevel(member.accessLevel)
        )
    ) {
        throw new ApiError(
            "The API returned an invalid collaborator response."
        )
    }

    const index = state.songBookMembers.findIndex(candidate =>
        candidate.id === member.id ||
        candidate.email.toLowerCase() === member.email.toLowerCase()
    )

    if (index === -1) {
        state.songBookMembers.push(member)
    } else {
        state.songBookMembers[index] = member
    }
}

function captureCurrentSongDraft() {
    if (
        state.editorMode === "idle" ||
        state.selectedSongBookId === null
    ) {
        return null
    }

    const values = {}

    for (const fieldName of [
        "title",
        "author",
        "originalTitle",
        "number",
        "key",
        "tempo"
    ]) {
        values[fieldName] =
            elements.songForm.elements.namedItem(fieldName).value
    }

    return {
        accountEmail: state.auth.email,
        mode: state.editorMode,
        songBookId: state.selectedSongBookId,
        songId: state.selectedSongId,
        selectedSong: state.selectedSong === null
            ? null
            : {
                ...state.selectedSong,
                parts: (state.selectedSong.parts ?? []).map(
                    part => ({ ...part })
                )
            },
        values,
        draftParts: state.draftParts.map(part => ({ ...part }))
    }
}

async function restorePreservedSongDraft() {
    const draft = preservedSongDraft

    if (draft === null || !isAuthenticated()) {
        return false
    }

    if (
        typeof draft.accountEmail !== "string" ||
        typeof state.auth.email !== "string" ||
        draft.accountEmail.toLowerCase() !== state.auth.email.toLowerCase()
    ) {
        preservedSongDraft = null
        return false
    }

    if (state.selectedSongBookId !== draft.songBookId) {
        const selected = await selectSongBook(draft.songBookId, {
            preserveNotice: true
        })

        if (!selected) {
            preservedSongDraft = null
            return false
        }
    }

    if (!canManageSongs()) {
        preservedSongDraft = null
        return false
    }

    state.editorMode = draft.mode
    state.selectedSongId = draft.songId
    state.selectedSong = draft.selectedSong
    state.draftParts = draft.draftParts.map(part => ({ ...part }))
    populateSongForm(elements.songForm, draft.values)
    openEditor(
        draft.mode === "create" ? "Create song" : "Edit song",
        draft.mode === "create" ? "Create song" : "Save changes"
    )
    renderSongList()
    renderSongDetails()
    preservedSongDraft = null
    return true
}

function focusSongBookList() {
    const firstBookButton = findDescendant(
        elements.songBookList,
        element => element.dataset?.action === "select-song-book"
    )

    if (firstBookButton !== null) {
        firstBookButton.focus()
        return
    }

    if (!elements.newSongBookButton.hidden) {
        elements.newSongBookButton.focus()
        return
    }

    elements.songBookListHeading.focus()
}

function focusAfterLogin() {
    if (!elements.selectedSongBookPanel.hidden) {
        elements.selectedSongBookHeading.focus()
        return
    }

    focusSongBookList()
}

async function handleAuthenticationFailure(error) {
    if (!(error instanceof ApiError && error.status === 401)) {
        return false
    }

    clearPrivateState()
    renderPrivateState()
    await loadAuthState()
    state.authView = "login"
    authPanelTrigger = elements.showLoginButton
    setNotice(
        "error",
        "Your session ended. Sign in to access your song books."
    )
    renderAuth()
    renderNotice()
    elements.loginEmail.focus()
    return true
}

async function handleSelectedBookFailure(error) {
    if (await handleAuthenticationFailure(error)) {
        return true
    }

    if (
        !(error instanceof ApiError) ||
        ![403, 404].includes(error.status)
    ) {
        return false
    }

    clearSelectedSongBook()
    renderSongBookList()
    renderSelectedSongBook()
    renderSongBookMembers()
    renderSongList()
    renderCollectionState()
    renderSongDetails()
    renderMutationControls()

    if (isAuthenticated()) {
        await loadSongBooks({ showSuccessNotice: false })
    }

    setNotice(
        "error",
        "That song book is no longer available to your account."
    )
    renderNotice()
    focusSongBookList()
    return true
}

async function handleAmbiguousSongNotFound(songBookId) {
    try {
        await getSongBook(songBookId)
        return false
    } catch (error) {
        const handled = await handleSelectedBookFailure(error)

        if (!handled) {
            console.error(error)
        }

        return handled
    }
}

async function handleMutationAuthorizationFailure(error) {
    if (!(error instanceof ApiError)) {
        return false
    }

    if (error.status === 401) {
        preservedSongDraft = captureCurrentSongDraft()
        clearPrivateState()
        renderPrivateState()
        await loadAuthState()
        state.authView = "login"
        authPanelTrigger = elements.showLoginButton
        setNotice(
            "error",
            "Your session ended. Sign in to retry; your unsaved " +
                "song data was kept."
        )
        renderAuth()
        renderNotice()
        elements.loginEmail.focus()
        return true
    }

    if (error.status === 403) {
        if (state.selectedSongBookId !== null) {
            try {
                const selectedSongBook = await getSongBook(
                    state.selectedSongBookId
                )
                state.selectedSongBook = selectedSongBook
                state.selectedSongBookAccessLevel =
                    normalizeAccessLevel(selectedSongBook?.accessLevel)
            } catch (refreshError) {
                if (await handleSelectedBookFailure(refreshError)) {
                    return true
                }

                console.error(refreshError)
            }
        }

        setNotice(
            "error",
            "Your account is not allowed to make this change. " +
                "Your song data was kept."
        )
        renderSelectedSongBook()
        renderSongBookMembers()
        renderMutationControls()
        renderNotice()
        return true
    }

    return false
}

function getAuthValidationMessage(error, fallback) {
    if (error instanceof ApiError && error.status === 400) {
        const safeDetail = getSafeApiDetail(error)

        if (safeDetail !== null) {
            return `${fallback} ${toSentence(safeDetail)}`
        }
    }

    return fallback
}

function handleAuthQuery() {
    const currentUrl = new URL(window.location.href)
    const authResult = currentUrl.searchParams.get("auth")
    let handled = false

    if (authResult === "confirmed") {
        setNotice("success", "Email confirmed. You can now sign in.")
        handled = true
    } else if (authResult === "confirmation-failed") {
        setNotice(
            "error",
            "The confirmation link is invalid or expired."
        )
        handled = true
    } else if (authResult === "reset-password") {
        const email = currentUrl.searchParams.get("email")
        const code = currentUrl.searchParams.get("code")

        if (
            typeof email === "string" &&
            email !== "" &&
            typeof code === "string" &&
            code !== ""
        ) {
            resetPasswordCredentials = { email, code }
            elements.resetPasswordEmail.value = email
            state.authView = "reset-password"
            handled = true
        } else {
            setNotice(
                "error",
                "The password reset link is invalid or incomplete."
            )
            handled = true
        }
    }

    if (authResult !== null) {
        currentUrl.searchParams.delete("auth")
        currentUrl.searchParams.delete("email")
        currentUrl.searchParams.delete("code")
        const sanitizedUrl = currentUrl.pathname +
            (currentUrl.searchParams.size === 0
                ? ""
                : `?${currentUrl.searchParams}`) +
            currentUrl.hash
        window.history.replaceState(
            window.history.state,
            "",
            sanitizedUrl
        )
    }

    return handled
}

function getLoadSongBooksErrorMessage(error) {
    const staleMessage = state.songBooks.length === 0
        ? ""
        : " The displayed list may be out of date."

    if (error instanceof ApiError && error.status === null) {
        return "Could not reach the SongBook API. " +
            "Your song books could not be refreshed." +
            staleMessage
    }

    if (
        error instanceof ApiError &&
        error.status !== null &&
        error.status >= 500
    ) {
        return "The server could not load song books. Try again." +
            staleMessage
    }

    return "Could not load song books. Try again." + staleMessage
}

function getLoadPdfsErrorMessage(error) {
    const staleMessage = state.songBookPdfs.length === 0
        ? ""
        : " The displayed exports may be out of date."

    if (error instanceof ApiError && error.status === null) {
        return "Could not reach the SongBook API. " +
            "PDF exports could not be refreshed." + staleMessage
    }

    if (
        error instanceof ApiError &&
        error.status !== null &&
        error.status >= 500
    ) {
        return "The server could not load PDF exports. Try again." +
            staleMessage
    }

    return "Could not load PDF exports. Try Refresh PDFs." +
        staleMessage
}

function getGeneratePdfErrorMessage(error) {
    if (error instanceof ApiError && error.status === 400) {
        const detail = getSafeApiDetail(error)
        return detail === null
            ? "The PDF request was rejected. Check the selected songs."
            : `The PDF request was rejected. ${toSentence(detail)}`
    }

    if (error instanceof ApiError && error.status === null) {
        return "Could not generate the PDF. It may have been created; " +
            "try Refresh PDFs before retrying."
    }

    return "Could not generate the PDF. Try Refresh PDFs before retrying."
}

function getDownloadPdfErrorMessage(error) {
    if (error instanceof ApiError && error.status === null) {
        return "Could not reach the SongBook API. " +
            "Try downloading the PDF again."
    }

    return "Could not download the PDF. Try again."
}

function getLoadSongBookErrorMessage(error) {
    if (error instanceof ApiError && error.status === null) {
        return "Could not reach the SongBook API. " +
            "Open the song book again to retry."
    }

    if (
        error instanceof ApiError &&
        error.status !== null &&
        error.status >= 500
    ) {
        return "The server could not load the selected song book. " +
            "Try again."
    }

    return "Could not load the selected song book. Try again."
}

function getSaveSongBookErrorMessage(error, mode) {
    const action = mode === "create" ? "create" : "rename"

    if (error instanceof ApiError && error.status === 409) {
        return "You already have a song book with that name. " +
            "Choose a different name."
    }

    if (error instanceof ApiError && error.status === 400) {
        const detail = getSafeApiDetail(error)
        return detail === null
            ? `The song book could not be ${action}d. Check the name.`
            : `The song book could not be ${action}d. ` +
                toSentence(detail)
    }

    if (error instanceof ApiError && error.status === null) {
        return "Could not reach the SongBook API. " +
            "The entered name was kept."
    }

    return `Could not ${action} the song book. The entered name was kept.`
}

function getDeleteSongBookErrorMessage(error) {
    if (error instanceof ApiError && error.status === null) {
        return "Could not reach the SongBook API. " +
            "The song book was not deleted."
    }

    return "Could not delete the song book. Try again."
}

function getSongBookAccessErrorMessage(error) {
    if (error instanceof ApiError && error.status === 400) {
        const detail = getSafeApiDetail(error)
        return detail === null
            ? "The collaborator access request was rejected."
            : `The collaborator access request was rejected. ` +
                toSentence(detail)
    }

    if (error instanceof ApiError && error.status === null) {
        return "Could not reach the SongBook API. " +
            "The collaborator change was not saved."
    }

    return "Could not update collaborator access. Try again."
}

function getLoadSongsErrorMessage(error) {
    const staleListMessage = state.songs.length === 0
        ? ""
        : " The displayed list may be out of date."

    if (error instanceof ApiError && error.status === null) {
        return "Could not reach the SongBook API. " +
            "Check that it is running, then try again." +
            staleListMessage
    }

    if (error instanceof ApiError && error.status === 400) {
        return "The API rejected the request to load songs. Try again." +
            staleListMessage
    }

    if (
        error instanceof ApiError &&
        error.status !== null &&
        error.status >= 500
    ) {
        return "The server could not load songs. Try again." +
            staleListMessage
    }

    return "Could not load songs. Try again." + staleListMessage
}

function getLoadSongErrorMessage(error) {
    if (error instanceof ApiError && error.status === null) {
        return "Could not reach the SongBook API. " +
            "Select the song again to retry."
    }

    if (error instanceof ApiError && error.status === 400) {
        return "The API rejected the request for song details. " +
            "Select the song again to retry."
    }

    if (
        error instanceof ApiError &&
        error.status !== null &&
        error.status >= 500
    ) {
        return "The server could not load song details. " +
            "Select the song again to retry."
    }

    return "Could not load song details. " +
        "Select the song again to retry."
}

function getSaveErrorMessage(error, saveMode) {
    const keptDraftMessage = saveMode === "create"
        ? "Your new song draft was kept."
        : "Your changes were kept."

    if (
        saveMode === "edit" &&
        error instanceof ApiError &&
        error.status === 404
    ) {
        return "This song no longer exists. " +
            "Your changes were not saved."
    }

    if (error instanceof ApiError && error.status === null) {
        return "Could not reach the SongBook API. " +
            `${keptDraftMessage} Try again.`
    }

    if (error instanceof ApiError && error.status === 400) {
        const safeDetail = getSafeApiDetail(error)
        const detailMessage = safeDetail === null
            ? ""
            : ` ${toSentence(safeDetail)}`

        return "The API rejected the submitted song." +
            detailMessage +
            " Review the entered values and try again. " +
            keptDraftMessage
    }

    if (
        error instanceof ApiError &&
        error.status !== null &&
        error.status >= 500
    ) {
        return saveMode === "create"
            ? "The server could not create the song. " +
                `${keptDraftMessage} Try again.`
            : "The server could not save the changes. " +
                `${keptDraftMessage} Try again.`
    }

    return saveMode === "create"
        ? "Could not create the song. " +
            `${keptDraftMessage} Try again.`
        : "Could not save the changes. " +
            `${keptDraftMessage} Try again.`
}

function getSafeApiDetail(error) {
    if (!(error instanceof ApiError)) {
        return null
    }

    for (const candidate of getApiDetailCandidates(error.details)) {
        if (typeof candidate !== "string") {
            continue
        }

        const normalizedCandidate = candidate
            .replace(/\s+/g, " ")
            .trim()

        if (
            normalizedCandidate === "" ||
            normalizedCandidate.length > 240 ||
            /[<>]/.test(normalizedCandidate) ||
            /\b(exception|stack trace)\b/i.test(normalizedCandidate)
        ) {
            continue
        }

        return normalizedCandidate
    }

    return null
}

function getApiDetailCandidates(details) {
    if (typeof details === "string") {
        return [details]
    }

    if (
        details === null ||
        typeof details !== "object" ||
        Array.isArray(details)
    ) {
        return []
    }

    const candidates = [details.detail]

    if (
        details.errors !== null &&
        typeof details.errors === "object" &&
        !Array.isArray(details.errors)
    ) {
        for (const fieldErrors of Object.values(details.errors)) {
            if (Array.isArray(fieldErrors)) {
                candidates.push(...fieldErrors)
            } else {
                candidates.push(fieldErrors)
            }
        }
    }

    candidates.push(details.message, details.title)
    return candidates
}

function toSentence(value) {
    return /[.!?]$/.test(value) ? value : `${value}.`
}

function getPostSaveNotice({
    collectionLoaded,
    detailLoaded,
    saveMode
}) {
    if (collectionLoaded && detailLoaded) {
        return {
            type: "success",
            message: saveMode === "create"
                ? "Song created."
                : "Changes saved."
        }
    }

    if (detailLoaded) {
        return {
            type: "error",
            message: saveMode === "create"
                ? "Song created, but the song list could not be reloaded. " +
                    "Try Refresh songs."
                : "Changes saved, but the song list could not be reloaded. " +
                    "Try Refresh songs."
        }
    }

    return {
        type: "error",
        message: saveMode === "create"
            ? "Song created, but its saved details could not be loaded. " +
                "Select it again to retry."
            : "Changes saved, but the saved song could not be reloaded. " +
                "Select it again to retry."
    }
}

export async function initialize() {
    closeEditor()
    const authQueryHandled = handleAuthQuery()
    renderAuth()
    renderUserManagement()
    renderSongBookList()
    renderSongBookState()
    renderSelectedSongBook()
    renderSongBookMembers()
    renderSongDetails()
    renderMutationControls()
    renderNotice()
    await loadAuthState()

    if (isAuthenticated()) {
        await loadSongBooks({
            showSuccessNotice: !authQueryHandled
        })
    }

    renderNotice()

    if (state.authView === "reset-password") {
        renderAuth()
        elements.resetPasswordNewPassword.focus()
    }
}

export const initialization = initialize()
