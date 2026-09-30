import { request } from "./httpClient.js"

export function getCurrentUser() {
    return request("/auth/me")
}

export function registerAccount(payload) {
    return request("/auth/register", {
        method: "POST",
        json: payload
    })
}

export function login(payload) {
    return request("/auth/login", {
        method: "POST",
        json: payload
    })
}

export function logout() {
    return request("/auth/logout", {
        method: "POST"
    })
}

export function resendConfirmation(email) {
    return request("/auth/resend-confirmation", {
        method: "POST",
        json: { email }
    })
}

export function requestPasswordReset(email) {
    return request("/auth/forgot-password", {
        method: "POST",
        json: { email }
    })
}

export function resetPassword(payload) {
    return request("/auth/reset-password", {
        method: "POST",
        json: payload
    })
}
