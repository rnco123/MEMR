/**
 * mammoth ships browser and node entry points; only the package root carries types,
 * and the browser build is what the docx preview loads.
 */
declare module 'mammoth/mammoth.browser' {
  export function convertToHtml(
    input: { arrayBuffer: ArrayBuffer },
  ): Promise<{ value: string; messages: { type: string; message: string }[] }>
}
