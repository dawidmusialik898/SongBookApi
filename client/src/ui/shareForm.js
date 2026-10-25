import { h } from "./dom.js"
import { getLoadCollaboratorsErrorMessage } from "./errors.js"
import { normalizeAccessLevel } from "./format.js"
import { createPagedList } from "./pagedList.js"

export const COLLABORATOR_ACCESS_LEVELS = new Set(["reader", "editor"])

export function createShareView({ onSubmit }) {
    const heading = h("h1", {
        id: "screen-heading",
        attrs: { tabindex: "-1" },
        text: "Share"
    })
    const intro = h("p", {
        id: "share-intro",
        className: "share-intro",
        text: "Readers can view songs and download PDFs. Editors can also add, edit, and delete songs."
    })
    const emailInput = h("input", {
        id: "share-email",
        type: "email",
        disabled: true,
        attrs: {
            autocomplete: "off",
            required: true
        }
    })
    const emailField = h("div", {
        className: "form-field"
    },
    h("label", {
        attrs: { for: "share-email" },
        text: "Email of a registered user"
    }),
    emailInput)
    const accessSelect = h("select", {
        id: "share-access-level",
        disabled: true,
        attrs: { "aria-label": "Access" }
    },
    h("option", {
        attrs: { value: "reader" },
        text: "Reader"
    }),
    h("option", {
        attrs: { value: "editor" },
        text: "Editor"
    }))
    accessSelect.value = "reader"
    const accessField = h("div", {
        className: "form-field"
    },
    h("label", {
        attrs: { for: "share-access-level" },
        text: "Access"
    }),
    accessSelect)
    const submitButton = h("button", {
        id: "share-submit",
        className: "button button--primary",
        type: "submit",
        disabled: true,
        text: "Add"
    })
    const formError = h("p", {
        id: "share-form-error",
        className: "form-error",
        attrs: { role: "alert" },
        hidden: true
    })
    const shareForm = h("form", {
        id: "share-form",
        className: "share-form",
        hidden: true,
        on: { submit: onSubmit }
    },
    emailField,
    accessField,
    submitButton,
    formError)
    const collaboratorList = h("ul", {
        id: "collaborator-list",
        className: "row-list collaborator-list",
        hidden: true
    })
    const listState = h("p", {
        id: "collaborator-list-state",
        className: "list-state",
        text: "Loading collaborators…"
    })
    const moreButton = h("button", {
        id: "show-more-collaborators",
        className: "button button--neutral",
        type: "button",
        attrs: { "aria-label": "Show more collaborators" },
        hidden: true,
        disabled: true,
        text: "Show more"
    })

    return {
        heading,
        intro,
        emailInput,
        accessSelect,
        submitButton,
        formError,
        shareForm,
        collaboratorList,
        listState,
        moreButton
    }
}

export function createCollaboratorRow(collaborator, { disabled = false } = {}) {
    const accessSelectId =
        `collaborator-access-${collaborator.id}`
    const accessSelectForRow = h("select", {
        id: accessSelectId,
        dataset: {
            action: "change-access",
            accessId: collaborator.id
        },
        disabled
    },
    h("option", {
        attrs: { value: "reader" },
        text: "Reader"
    }),
    h("option", {
        attrs: { value: "editor" },
        text: "Editor"
    }))
    accessSelectForRow.value = collaborator.accessLevel
    const removeButton = h("button", {
        className: "button button--neutral",
        type: "button",
        dataset: {
            action: "remove-access",
            accessId: collaborator.id
        },
        attrs: {
            "aria-label": `Remove ${collaborator.email}`
        },
        disabled,
        text: "Remove"
    })

    const row = h("li", {
        className: "collaborator-item",
        dataset: { accessId: collaborator.id }
    },
    h("span", {
        className: "collaborator-item__email",
        text: collaborator.email
    }),
    h("div", {
        className: "collaborator-item__actions"
    },
    h("label", {
        className: "visually-hidden",
        attrs: { for: accessSelectId },
        text: `Access for ${collaborator.email}`
    }),
    accessSelectForRow,
    removeButton))

    return { row, accessSelect: accessSelectForRow, removeButton }
}

export function createCollaboratorList({
    list,
    stateElement,
    moreButton,
    fetchPage,
    signal
}) {
    const rowControls = new Map()
    let disabled = false
    const pagedList = createPagedList({
        list,
        stateElement,
        moreButton,
        fetchPage,
        renderItem: value => {
            const collaborator = readCollaborator(value)
            const { row, accessSelect, removeButton } =
                createCollaboratorRow(collaborator, { disabled })
            rowControls.set(collaborator.id, { accessSelect, removeButton })
            return row
        },
        getKey: collaborator => collaborator.id,
        messages: {
            loading: "Loading collaborators…",
            empty: () => h("span", {
                text: "Not shared with anyone yet."
            }),
            error: error => getLoadCollaboratorsErrorMessage(error)
        },
        signal
    })

    function upsert(collaborator) {
        const snapshot = pagedList.snapshot()
        if (snapshot.page === 0) {
            void pagedList.reload()
            return
        }
        const items = [...snapshot.items]
        const existingIndex = items.findIndex(item =>
            item.id === collaborator.id ||
            item.email.toLowerCase() === collaborator.email.toLowerCase()
        )
        if (existingIndex === -1) {
            items.unshift(collaborator)
        } else {
            items[existingIndex] = collaborator
        }
        restore({ ...snapshot, items })
    }

    function remove(accessId) {
        const snapshot = pagedList.snapshot()
        restore({
            ...snapshot,
            items: snapshot.items.filter(item => item.id !== accessId)
        })
    }

    function restore(snapshot) {
        rowControls.clear()
        pagedList.restore(snapshot)
    }

    function setDisabled(value) {
        disabled = value
        for (const controls of rowControls.values()) {
            controls.accessSelect.disabled = value
            controls.removeButton.disabled = value
        }
    }

    return {
        reload: () => pagedList.reload(),
        items: () => pagedList.items(),
        upsert,
        remove,
        setDisabled,
        accessSelectFor: accessId =>
            rowControls.get(accessId)?.accessSelect ?? null
    }
}

export function readCollaborator(value) {
    const accessLevel = normalizeAccessLevel(value?.accessLevel)
    if (
        value === null ||
        typeof value !== "object" ||
        typeof value.id !== "string" ||
        value.id.trim() === "" ||
        typeof value.email !== "string" ||
        value.email.trim() === "" ||
        !COLLABORATOR_ACCESS_LEVELS.has(accessLevel)
    ) {
        throw new TypeError("The API returned invalid collaborator data.")
    }
    return {
        id: value.id,
        email: value.email,
        accessLevel
    }
}
