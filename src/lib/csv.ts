export function parseCsv(text: string, delimiter = ','): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  const endRow = () => {
    row.push(field)
    if (row.length > 1 || row[0] !== '') rows.push(row)
    row = []
    field = ''
  }
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c !== '"') field += c
      else if (text[i + 1] === '"') {
        field += '"'
        i++
      } else quoted = false
    } else if (c === '"') quoted = true
    else if (c === delimiter) {
      row.push(field)
      field = ''
    } else if (c === '\n') endRow()
    else if (c !== '\r') field += c
  }
  if (field !== '' || row.length) endRow()
  return rows
}

export function yen(s: string | undefined): number {
  const t = (s ?? '').replace(/[,\s]/g, '')
  if (t === '' || t === '-') return 0
  const n = Number(t)
  if (!Number.isFinite(n)) throw new Error(`Bad amount: ${s}`)
  return n
}

export function decode(bytes: ArrayBuffer, encoding: string): string {
  return new TextDecoder(encoding).decode(bytes).replace(/^﻿/, '')
}
