import {
    getCurrentUser,
    logout
} from "./authApi.js"
import {
    ApiError,
    resetAntiforgeryToken
} from "./httpClient.js"

const VALID_ROLES = new Set(["user", "moderator", "superuser"])

export function createSession(ctx) {
    const state = {
        status: "loading",
        email: null,
        role: null,
        generation: 0
    }
    let ending = null
    let signingOut = false

    async function load() {
        const requestGeneration = ++state.generation
        state.status = "loading"
        state.email = null
        state.role = null

        try {
            const user = await getCurrentUser()
            if (requestGeneration !== state.generation) {
                return state
            }

            if (user?.isAuthenticated !== true) {
                state.status = "anonymous"
                ctx.cache.bookList = null
                return state
            }

            state.status = "authenticated"
            state.email = typeof user.email === "string" &&
                user.email.trim() !== ""
                ? user.email
                : null
            state.role = VALID_ROLES.has(user.role)
                ? user.role
                : null
            ctx.drafts.clearIfOwnerChanged(state.email)
            return state
        } catch (error) {
            if (requestGeneration !== state.generation) {
                return state
            }

            state.email = null
            state.role = null
            state.status = error instanceof ApiError &&
                error.status === 401
                ? "anonymous"
                : "unavailable"
            ctx.cache.bookList = null
            return state
        }
    }

    async function ended() {
        if (ending !== null) {
            return ending
        }

        state.generation += 1
        state.status = "anonymous"
        state.email = null
        state.role = null
        ctx.cache.bookList = null
        resetAntiforgeryToken()
        ctx.auth.forceAuth = false

        ending = (async () => {
            const result = await ctx.router.render({ focus: true })
            const draftKept = ctx.drafts.hasAny() ||
                result?.cleanupStatus?.draftKept === true
            ctx.status.show(
                "error",
                draftKept
                    ? "Your session ended. Sign in to retry; your unsaved song data was kept."
                    : "Your session ended. Sign in to access your song books."
            )
            return true
        })().finally(() => {
            ending = null
        })
        return ending
    }

    async function signOut() {
        if (signingOut) {
            return false
        }

        signingOut = true
        const requestGeneration = state.generation
        try {
            try {
                await logout()
            } catch (error) {
                if (!(error instanceof ApiError && error.status === 401)) {
                    if (requestGeneration === state.generation) {
                        ctx.status.show(
                            "error",
                            "Sign-out could not be completed. Try again."
                        )
                    }
                    return false
                }
            }

            if (requestGeneration !== state.generation) {
                return false
            }

            ctx.drafts.clear()
            ctx.cache.bookList = null
            ctx.auth.forceAuth = false
            ctx.auth.view = "login"
            ctx.auth.emailPrefill = ""
            resetAntiforgeryToken()
            await load()
            await ctx.router.navigate("/", {
                replace: true,
                status: "Signed out."
            })
            return true
        } finally {
            signingOut = false
        }
    }

    return { state, load, ended, signOut }
}
