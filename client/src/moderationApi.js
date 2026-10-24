import { request } from "./httpClient.js"
import { pageUrl } from "./pagination.js"

const USERS_URL = "/admin/users"

function getUserUrl(userId) {
    if (
        userId === undefined ||
        userId === null ||
        String(userId).trim() === ""
    ) {
        throw new TypeError("User id must not be blank.")
    }

    return `${USERS_URL}/${encodeURIComponent(userId)}`
}

export function getManagedUsers(page = 1) {
    return request(pageUrl(USERS_URL, page))
}

export function setManagedUserRole(userId, role) {
    return request(`${getUserUrl(userId)}/role`, {
        method: "PUT",
        json: { role }
    })
}

export function setManagedUserBan(userId, isBanned) {
    return request(`${getUserUrl(userId)}/ban`, {
        method: "PUT",
        json: { isBanned }
    })
}

export function deleteManagedUser(userId) {
    return request(getUserUrl(userId), { method: "DELETE" })
}
