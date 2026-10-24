export function createDrafts() {
    let owner = null
    const drafts = new Map()

    function normalizedOwner(value) {
        if (typeof value !== "string" || value.trim() === "") {
            throw new TypeError("A draft owner email is required.")
        }
        return value.trim().toLowerCase()
    }

    function deleteDraft(key) {
        drafts.delete(key)
        if (drafts.size === 0) {
            owner = null
        }
    }

    return {
        get owner() {
            return owner
        },
        get(key) {
            return drafts.get(key) ?? null
        },
        set(account, key, draft) {
            const nextOwner = normalizedOwner(account)
            if (typeof key !== "string" || key.trim() === "") {
                throw new TypeError("A draft key is required.")
            }
            if (owner !== null && owner !== nextOwner) {
                drafts.clear()
            }
            owner = nextOwner
            drafts.set(key, draft)
        },
        delete: deleteDraft,
        clear() {
            drafts.clear()
            owner = null
        },
        clearIfOwnerChanged(account) {
            const nextOwner = typeof account === "string"
                ? account.trim().toLowerCase()
                : null
            if (owner !== null && owner !== nextOwner) {
                drafts.clear()
                owner = null
            }
        },
        hasAny() {
            return drafts.size > 0
        },
        size() {
            return drafts.size
        }
    }
}
