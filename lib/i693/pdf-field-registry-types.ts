export type PdfFieldBinding = {
  key: string
  pdfFieldName: string
  page: number
  kind: 'text' | 'mark'
  slot?: 'name_family' | 'name_given' | 'phone_day' | 'phone_mobile'
  format?: 'date'
  when?: string
}
