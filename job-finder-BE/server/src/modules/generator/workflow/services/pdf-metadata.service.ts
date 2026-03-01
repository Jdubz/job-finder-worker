import { PDFDocument } from 'pdf-lib'

interface PdfMetadataOptions {
  title?: string
  author?: string
  subject?: string
  keywords?: string[]
}

/**
 * Inject metadata into a PDF buffer.
 * Clears producer/creator strings to remove library branding.
 */
export async function injectPdfMetadata(
  pdfBuffer: Buffer,
  options: PdfMetadataOptions
): Promise<Buffer> {
  const doc = await PDFDocument.load(pdfBuffer)

  if (options.title) doc.setTitle(options.title)
  if (options.author) doc.setAuthor(options.author)
  if (options.subject) doc.setSubject(options.subject)
  if (options.keywords?.length) doc.setKeywords(options.keywords)

  doc.setProducer('')
  doc.setCreator('')

  const bytes = await doc.save()
  return Buffer.from(bytes)
}
