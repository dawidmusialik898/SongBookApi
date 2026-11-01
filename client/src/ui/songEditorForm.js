import { h } from "./dom.js"
import { createMenu } from "./menu.js"

// Mirrors the server's song field limits (SongEndpoints.ValidateSongLimits).
const TITLE_MAX_LENGTH = 200
const SHORT_FIELD_MAX_LENGTH = 32
const PART_NAME_MAX_LENGTH = 100

const DETAIL_FIELDS = [
    ["author", "song-author", "Author", TITLE_MAX_LENGTH],
    ["originalTitle", "song-original-title", "Original title", TITLE_MAX_LENGTH],
    ["number", "song-number", "Number", SHORT_FIELD_MAX_LENGTH],
    ["key", "song-key", "Key", SHORT_FIELD_MAX_LENGTH],
    ["tempo", "song-tempo", "Tempo", SHORT_FIELD_MAX_LENGTH]
]

export function createSongEditorForm(ctx, {
    mode,
    bookName,
    model,
    draftRestored,
    onFieldInput,
    onPartInput,
    onAddPart,
    onMovePart,
    onRemovePart,
    onCancel,
    onSubmit,
    onDiscard
}) {
    const menus = []
    const partTextareas = new Map()
    const partNameInputs = new Map()
    const partErrorElements = new Map()

    const form = h("form", {
        id: "song-editor-form",
        className: "editor-form",
        attrs: { novalidate: "" }
    })
    form.setAttribute("aria-busy", "false")

    const heading = h("h1", {
        id: "screen-heading",
        attrs: { tabindex: "-1" },
        text: mode === "create" ? "New song" : "Edit song"
    })
    const cancelButton = h("button", {
        id: "editor-cancel-button",
        className: "button button--neutral",
        type: "button",
        text: "Cancel",
        on: { click: onCancel }
    })
    const saveButton = h("button", {
        id: "editor-save-button",
        className: "button button--primary",
        type: "submit",
        text: "Save"
    })
    const editorBar = h("header", {
        className: "editor-bar"
    },
    cancelButton,
    h("div", {
        className: "editor-bar__title"
    },
    heading,
    h("span", {
        className: "editor-bar__book",
        text: bookName
    })),
    saveButton)
    const editorStatus = h("p", {
        id: "editor-status",
        className: "editor-status",
        attrs: { role: "status", "aria-live": "polite" },
        hidden: true
    })
    const draftNotice = h("div", {
        id: "draft-restored-notice",
        className: "editor-notice",
        attrs: { role: "status" },
        hidden: !draftRestored
    },
    h("p", { text: "Restored your unsaved changes." }),
    h("button", {
        id: "discard-draft-button",
        className: "button button--neutral",
        type: "button",
        text: "Discard them",
        on: { click: onDiscard }
    }))
    const titleField = createTextField({
        id: "song-title",
        name: "title",
        label: "Title",
        value: model.fields.title,
        maxLength: TITLE_MAX_LENGTH
    })
    const moreDetailsButton = h("button", {
        id: "more-details-button",
        className: "button button--link",
        type: "button",
        attrs: {
            "aria-expanded": "false",
            "aria-controls": "more-details"
        },
        text: "More details"
    })
    const moreDetails = h("div", {
        id: "more-details",
        className: "editor-details"
    })
    const detailInputs = new Map()
    for (const [name, id, label, maxLength] of DETAIL_FIELDS) {
        const field = createTextField({
            id,
            name,
            label,
            value: model.fields[name],
            maxLength
        })
        moreDetails.appendChild(field.wrapper)
        detailInputs.set(name, field.input)
    }
    const partsEditor = h("div", { id: "parts-editor" })
    const addPartButton = h("button", {
        id: "add-part-button",
        className: "button button--neutral",
        type: "button",
        text: "Add part",
        on: { click: onAddPart }
    })

    form.appendChild(editorBar)
    form.appendChild(editorStatus)
    form.appendChild(draftNotice)
    form.appendChild(titleField.wrapper)
    form.appendChild(moreDetailsButton)
    form.appendChild(moreDetails)
    form.appendChild(h("p", {
        id: "chord-hint",
        className: "editor-hint",
        text: "Put chords in square brackets right before the syllable: " +
            "[Am]Amazing [D7]grace. Type \\[ for a literal bracket."
    }))
    form.appendChild(partsEditor)
    form.appendChild(addPartButton)
    ctx.root.replaceChildren(form)

    titleField.input.addEventListener("input", () =>
        onFieldInput("title", titleField.input.value)
    )
    for (const [name, input] of detailInputs) {
        input.addEventListener("input", () =>
            onFieldInput(name, input.value)
        )
    }
    moreDetailsButton.addEventListener("click", () =>
        setDetailsExpanded(moreDetails.hidden)
    )
    form.addEventListener("submit", event => {
        event.preventDefault()
        return onSubmit()
    })

    function setDetailsExpanded(expanded) {
        const value = expanded === true
        moreDetails.hidden = !value
        moreDetailsButton.setAttribute("aria-expanded", String(value))
    }

    function renderParts(currentModel, errors = new Map(), focusPartKey = null) {
        for (const menu of menus) {
            ctx.shell.unregisterMenu(menu)
        }
        menus.length = 0
        partTextareas.clear()
        partNameInputs.clear()
        partErrorElements.clear()
        partsEditor.replaceChildren()

        for (const [index, part] of currentModel.parts.entries()) {
            const errorId = `part-error-${part.key}`
            const menuItems = []
            if (index > 0) {
                menuItems.push({
                    kind: "button",
                    text: "Move up",
                    action: "move-part-up",
                    onSelect: () => onMovePart(part.key, -1)
                })
            }
            if (index < currentModel.parts.length - 1) {
                menuItems.push({
                    kind: "button",
                    text: "Move down",
                    action: "move-part-down",
                    onSelect: () => onMovePart(part.key, 1)
                })
            }
            menuItems.push({
                kind: "button",
                text: "Remove part",
                action: "remove-part",
                destructive: true,
                onSelect: () => onRemovePart(part.key)
            })
            const menu = ctx.registerMenu(createMenu({
                label: "⋯",
                accessibleName: `Part ${index + 1} actions`,
                buttonId: `part-menu-button-${part.key}`,
                id: `part-menu-${part.key}`,
                items: menuItems
            }))
            menu.root.classList.add("part-editor__menu")
            menus.push(menu)

            const nameInput = h("input", {
                id: `part-name-${part.key}`,
                type: "text",
                dataset: { partField: "name", partKey: part.key },
                attrs: {
                    placeholder: "e.g. Verse 1",
                    maxlength: String(PART_NAME_MAX_LENGTH)
                }
            })
            nameInput.value = part.name
            nameInput.addEventListener("input", () =>
                onPartInput(part.key, "name", nameInput.value)
            )
            partNameInputs.set(part.key, nameInput)

            const textarea = h("textarea", {
                id: `part-text-${part.key}`,
                dataset: { partField: "text", partKey: part.key },
                attrs: {
                    rows: String(rowsFor(part.notation)),
                    spellcheck: "false",
                    "aria-describedby": errorId
                }
            })
            textarea.value = part.notation
            textarea.addEventListener("input", () => {
                textarea.setAttribute(
                    "rows",
                    String(rowsFor(textarea.value))
                )
                onPartInput(part.key, "notation", textarea.value)
            })
            partTextareas.set(part.key, textarea)

            const error = h("p", {
                id: errorId,
                className: "part-error",
                hidden: true
            })
            partErrorElements.set(part.key, error)
            partsEditor.appendChild(h("fieldset", {
                className: "part-editor",
                dataset: { partKey: part.key }
            },
            h("legend", { text: `Part ${index + 1}` }),
            menu.root,
            createLabeledControl("Part name", nameInput),
            createLabeledControl("Lyrics and chords", textarea),
            error))
            renderPartError(part, currentModel, errors)
        }

        if (focusPartKey !== null) {
            partNameInputs.get(focusPartKey)?.focus()
        }
    }

    function renderPartError(part, currentModel, errors) {
        const error = partErrorElements.get(part.key)
        if (error === undefined) {
            return
        }
        const messages = (errors.get(part.key) ?? [])
            .map(item => `Line ${item.line}: ${item.message}`)
        if (currentModel.simplified.includes(part.id ?? part.key)) {
            messages.push(
                "Some chord symbols contained brackets and were simplified."
            )
        }
        error.textContent = messages.join("\n")
        error.hidden = messages.length === 0
    }

    function updatePartErrors(currentModel, errors) {
        for (const part of currentModel.parts) {
            renderPartError(part, currentModel, errors)
        }
    }

    function update(currentModel, restored) {
        titleField.input.value = currentModel.fields.title
        for (const [name, input] of detailInputs) {
            input.value = currentModel.fields[name]
        }
        draftNotice.hidden = restored !== true
        setDetailsExpanded(hasDetails(currentModel))
        renderParts(currentModel)
    }

    function setBusy(busy) {
        form.setAttribute("aria-busy", String(busy))
        saveButton.textContent = busy ? "Saving…" : "Save"
        for (const control of form.elements) {
            control.disabled = busy
        }
    }

    renderParts(model)
    setDetailsExpanded(hasDetails(model))
    titleField.input.focus()

    return {
        form,
        titleInput: titleField.input,
        addPartButton,
        clearValidation(currentModel) {
            updatePartErrors(currentModel, new Map())
        },
        focusError(partKey) {
            partTextareas.get(partKey)?.focus()
        },
        renderParts,
        setBusy,
        setStatus(message) {
            editorStatus.textContent = message
            editorStatus.hidden = message === ""
        },
        showValidation(currentModel, errors) {
            updatePartErrors(currentModel, errors)
        },
        update
    }
}

function createTextField({ id, name, label, value, maxLength }) {
    const input = h("input", {
        id,
        type: "text",
        attrs: { name, maxlength: String(maxLength) }
    })
    input.value = value
    return {
        input,
        wrapper: createLabeledControl(label, input)
    }
}

function createLabeledControl(label, control) {
    return h("div", {
        className: "form-field"
    },
    h("label", {
        attrs: { for: control.id },
        text: label
    }),
    control)
}

function hasDetails(model) {
    return DETAIL_FIELDS.some(([name]) =>
        String(model.fields[name] ?? "").trim() !== ""
    )
}

function rowsFor(value) {
    return Math.max(
        4,
        String(value).split(/\r\n|\r|\n/).length + 1
    )
}
