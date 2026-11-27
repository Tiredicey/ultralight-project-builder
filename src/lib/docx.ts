// Minimal zero-dependency OOXML (.docx) generator for Cloudflare Workers.
// Packages valid WordprocessingML XML + embedded JPEG screenshots into a Store-mode ZIP archive.

const enc = new TextEncoder()

const crcTable = (() => {
  const t = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1)
    t[i] = c >>> 0
  }
  return t
})()

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function u16(v: number) { return [v & 0xff, (v >>> 8) & 0xff] }
function u32(v: number) { return [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff] }

function buildZip(files: Array<{ name: string; data: Uint8Array }>): Uint8Array {
  const locals: Uint8Array[] = []
  const centrals: Uint8Array[] = []
  let offset = 0

  for (const f of files) {
    const nameBytes = enc.encode(f.name)
    const crc = crc32(f.data)
    const size = f.data.length

    const lh = new Uint8Array([
      0x50, 0x4b, 0x03, 0x04, // local file header sig
      20, 0, // version
      0, 0, // flags
      0, 0, // method: store
      0, 0, 0, 0, // mod time/date
      ...u32(crc),
      ...u32(size),
      ...u32(size),
      ...u16(nameBytes.length),
      0, 0
    ])
    locals.push(lh, nameBytes, f.data)

    const ch = new Uint8Array([
      0x50, 0x4b, 0x01, 0x02, // central dir sig
      20, 0, 20, 0,
      0, 0, 0, 0,
      0, 0, 0, 0,
      ...u32(crc),
      ...u32(size),
      ...u32(size),
      ...u16(nameBytes.length),
      0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0,
      ...u32(offset)
    ])
    centrals.push(ch, nameBytes)
    offset += lh.length + nameBytes.length + size
  }

  const centralSize = centrals.reduce((a, b) => a + b.length, 0)
  const eocd = new Uint8Array([
    0x50, 0x4b, 0x05, 0x06,
    0, 0, 0, 0,
    ...u16(files.length),
    ...u16(files.length),
    ...u32(centralSize),
    ...u32(offset),
    0, 0
  ])

  const total = offset + centralSize + eocd.length
  const out = new Uint8Array(total)
  let pos = 0
  for (const chunk of [...locals, ...centrals, eocd]) {
    out.set(chunk, pos)
    pos += chunk.length
  }
  return out
}

const xmlEsc = (s: string) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')

const para = (text: string, opts?: { bold?: boolean; size?: number; color?: string; spaceAfter?: number }) => {
  const rPr = [
    opts?.bold ? '<w:b/>' : '',
    opts?.size ? `<w:sz w:val="${opts.size}"/><w:szCs w:val="${opts.size}"/>` : '',
    opts?.color ? `<w:color w:val="${opts.color}"/>` : ''
  ].join('')
  const pPr = opts?.spaceAfter != null ? `<w:pPr><w:spacing w:after="${opts.spaceAfter}"/></w:pPr>` : ''
  return `<w:p>${pPr}<w:r>${rPr ? `<w:rPr>${rPr}</w:rPr>` : ''}<w:t xml:space="preserve">${xmlEsc(text)}</w:t></w:r></w:p>`
}

const imagePara = (rId: string, docPrId: number, name: string, cx = 5760000, cy = 3600000) => `<w:p><w:pPr><w:spacing w:after="100"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${docPrId}" name="${xmlEsc(name)}"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${docPrId}" name="${xmlEsc(name)}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`

export interface ReportInput {
  studentName: string
  studentEmail: string
  sapUser: string
  packCode: string
  packTitle: string
  dateStr: string
  statusSummary: string
  conclusion: string
  variationIdx: number
  readbacks: Array<{ stepKey: string; message: string }>
  screenshots: Array<{ name: string; caption: string; base64: string }>
}

export function buildReportDocx(input: ReportInput): Uint8Array {
  const files: Array<{ name: string; data: Uint8Array }> = []
  const rels: string[] = []
  const bodyParts: string[] = []

  // Cover Header (STI Template)
  bodyParts.push(para('STI COLLEGE - IT2406 ENTERPRISE SYSTEMS', { bold: true, size: 28, color: '1F4E79', spaceAfter: 80 }))
  bodyParts.push(para(`${input.packCode}: ${input.packTitle}`, { bold: true, size: 32, spaceAfter: 160 }))
  bodyParts.push(para(`Student Name: ${input.studentName} (${input.studentEmail})`, { size: 22, spaceAfter: 60 }))
  bodyParts.push(para(`SAP S/4HANA Account: ${input.sapUser} (Client 236)`, { size: 22, spaceAfter: 60 }))
  bodyParts.push(para(`Date Generated: ${input.dateStr}`, { size: 22, spaceAfter: 60 }))
  bodyParts.push(para(`Execution Summary: ${input.statusSummary}`, { size: 22, spaceAfter: 240 }))

  // Evidence Figures
  bodyParts.push(para('1. Captured SAP Evidence & Screenshots', { bold: true, size: 26, color: '1F4E79', spaceAfter: 120 }))
  if (!input.screenshots.length) {
    bodyParts.push(para('No screenshots were captured during this run.', { size: 20, color: '666666', spaceAfter: 160 }))
  } else {
    input.screenshots.forEach((shot, i) => {
      const idx = i + 1
      const rId = `rIdImg${idx}`
      const mediaPath = `word/media/image${idx}.jpg`
      const bin = Uint8Array.from(atob(shot.base64), (ch) => ch.charCodeAt(0))
      files.push({ name: mediaPath, data: bin })
      rels.push(`<Relationship Id="${rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image${idx}.jpg"/>`)
      bodyParts.push(para(`Figure ${idx}: ${shot.caption || shot.name}`, { bold: true, size: 20, spaceAfter: 60 }))
      bodyParts.push(imagePara(rId, idx, shot.name || `figure-${idx}`))
    })
  }

  // Verified Status Bar Readbacks
  bodyParts.push(para('2. Verified SAP Execution Log', { bold: true, size: 26, color: '1F4E79', spaceAfter: 120 }))
  if (!input.readbacks.length) {
    bodyParts.push(para('No verified step readbacks recorded.', { size: 20, color: '666666', spaceAfter: 160 }))
  } else {
    for (const r of input.readbacks.slice(0, 60)) {
      bodyParts.push(para(`[${r.stepKey || 'step'}] ${r.message}`, { size: 18, spaceAfter: 40 }))
    }
  }

  // Analytical Conclusion
  bodyParts.push(para('3. Analytical Conclusion', { bold: true, size: 26, color: '1F4E79', spaceAfter: 120 }))
  bodyParts.push(para(input.conclusion, { size: 22, spaceAfter: 160 }))

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">
  <w:body>
    ${bodyParts.join('\n    ')}
    <w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr>
  </w:body>
</w:document>`

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="jpg" ContentType="image/jpeg"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`

  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`

  const docRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${rels.join('\n  ')}
</Relationships>`

  files.unshift(
    { name: '[Content_Types].xml', data: enc.encode(contentTypes) },
    { name: '_rels/.rels', data: enc.encode(rootRels) },
    { name: 'word/_rels/document.xml.rels', data: enc.encode(docRels) },
    { name: 'word/document.xml', data: enc.encode(documentXml) }
  )

  return buildZip(files)
}
