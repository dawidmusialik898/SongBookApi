import { startApp } from "../../src/app.js"
import { installAppBrowser } from "./testBrowser.mjs"

export function createAppHarness(api, { initialUrl } = {}) {
    const browser = installAppBrowser({
        api,
        ...(initialUrl === undefined ? {} : { initialUrl })
    })
    const app = startApp()
    return { api, browser, app }
}
