/** Pure edit-state for the eureka page editor; render-free and testable. */

/** Editor handle exposing the current schema and a save action. */
export interface EditorHandle {
  getValue: () => unknown
  setValue: (next: unknown) => void
  save: () => void
}

/**
 * Create edit state over a page schema.
 * @param schema - initial page JSON.
 * @param onSave - called with the current value when `save()` runs.
 * @returns handle whose value updates through `setValue`.
 */
export function createEditorHandle(schema: unknown, onSave: (value: unknown) => void): EditorHandle {
  let value = schema
  return {
    getValue: () => value,
    setValue: (next: unknown) => { value = next },
    save: () => { onSave(value) },
  }
}
