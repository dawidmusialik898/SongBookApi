import { startApp } from "../../src/app.js"
import { installAppBrowser } from "./testBrowser.mjs"

export function createAppHarness(api, { initialUrl, clipboard } = {}) {
    const browser = installAppBrowser({
        api,
        ...(clipboard === undefined ? {} : { clipboard }),
        ...(initialUrl === undefined ? {} : { initialUrl })
    })
    const app = startApp()
    return { api, browser, app }
}
