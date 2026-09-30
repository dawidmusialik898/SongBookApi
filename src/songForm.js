const SCALAR_FIELDS = [
    "title",
    "author",
    "originalTitle",
    "number",
    "key",
    "tempo"
]

export function createPartDraft(part) {
    return {
        clientKey: crypto.randomUUID(),
        id: part?.id ?? null,
        name: part?.name ?? "",
        text: part?.text ?? ""
    }
}

export function populateSongForm(form, song) {
    for (const fieldName of SCALAR_FIELDS) {
        const control = form.elements.namedItem(fieldName)
        control.value = song?.[fieldName] ?? ""
    }
}

export function buildSongPayload(form, draftParts) {
    const payload = {}

    for (const fieldName of SCALAR_FIELDS) {
        const control = form.elements.namedItem(fieldName)
        payload[fieldName] = normalizeText(control.value)
    }

    payload.parts = draftParts.map(draftPart => {
        const partPayload = {
            name: normalizeText(draftPart.name),
            text: normalizeText(draftPart.text)
        }

        if (draftPart.id !== null && draftPart.id !== undefined) {
            partPayload.id = draftPart.id
        }

        return partPayload
    })

    return payload
}

export function renderPartsEditor(container, draftParts) {
    container.replaceChildren()

    for (const [index, draftPart] of draftParts.entries()) {
        const fieldset = document.createElement("fieldset")
        fieldset.className = "part-editor__item"
        fieldset.dataset.partKey = draftPart.clientKey

        const legend = document.createElement("legend")
        legend.textContent = `Part ${index + 1}`

        const nameField = createPartField({
            clientKey: draftPart.clientKey,
            fieldName: "name",
            label: "Part name",
            tagName: "input",
            value: draftPart.name
        })
        const textField = createPartField({
            clientKey: draftPart.clientKey,
            fieldName: "text",
            label: "Part text",
            tagName: "textarea",
            value: draftPart.text
        })

        const actions = document.createElement("div")
        actions.className = "part-editor__actions"
        actions.appendChild(createPartButton({
            action: "move-part-up",
            clientKey: draftPart.clientKey,
            disabled: index === 0,
            label: "Move up"
        }))
        actions.appendChild(createPartButton({
            action: "move-part-down",
            clientKey: draftPart.clientKey,
            disabled: index === draftParts.length - 1,
            label: "Move down"
        }))
        actions.appendChild(createPartButton({
            action: "remove-part",
            clientKey: draftPart.clientKey,
            disabled: false,
            label: "Remove part",
            variant: "button--destructive"
        }))

        fieldset.appendChild(legend)
        fieldset.appendChild(nameField)
        fieldset.appendChild(textField)
        fieldset.appendChild(actions)
        container.appendChild(fieldset)
    }
}

function createPartField({
    clientKey,
    fieldName,
    label,
    tagName,
    value
}) {
    const wrapper = document.createElement("div")
    wrapper.className = "form-field"

    const controlId = `part-${fieldName}-${clientKey}`
    const fieldLabel = document.createElement("label")
    fieldLabel.setAttribute("for", controlId)
    fieldLabel.textContent = label

    const control = document.createElement(tagName)
    control.id = controlId
    control.dataset.partField = fieldName
    control.dataset.partKey = clientKey
    control.value = value

    if (tagName === "input") {
        control.type = "text"
    }

    wrapper.appendChild(fieldLabel)
    wrapper.appendChild(control)
    return wrapper
}

function createPartButton({
    action,
    clientKey,
    disabled,
    label,
    variant = "button--neutral"
}) {
    const button = document.createElement("button")
    button.className = `button ${variant}`
    button.type = "button"
    button.dataset.action = action
    button.dataset.partKey = clientKey
    button.disabled = disabled
    button.textContent = label
    return button
}

function normalizeText(value) {
    const normalizedValue = String(value ?? "").trim()
    return normalizedValue === "" ? null : normalizedValue
}
