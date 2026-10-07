import { decode, parseCsv } from '../csv'
import type { AccountType, ParsedRow } from '../types'
import { isMufg, parseMufg } from './mufg'
import { isPaypay, parsePaypay } from './paypay'

export type ImportErrorCode = 'wrong_type_mufg' | 'wrong_type_paypay' | 'unknown_format' | 'bad_row'

export class ImportError extends Error {
  code: ImportErrorCode
  constructor(code: ImportErrorCode) {
    super(code)
    this.code = code
  }
}

export function parseFile(bytes: ArrayBuffer, type: AccountType): ParsedRow[] {
  const sjis = parseCsv(decode(bytes, 'shift_jis'))
  const utf8 = parseCsv(decode(bytes, 'utf-8'))
  if (type === 'mufg' && isMufg(sjis)) return rowsOrBadRow(() => parseMufg(sjis))
  if (type === 'paypay' && isPaypay(utf8)) return rowsOrBadRow(() => parsePaypay(utf8))
  if (isPaypay(utf8)) throw new ImportError('wrong_type_paypay')
  if (isMufg(sjis)) throw new ImportError('wrong_type_mufg')
  throw new ImportError('unknown_format')
}

function rowsOrBadRow(parse: () => ParsedRow[]): ParsedRow[] {
  try {
    return parse()
  } catch {
    console.error('bad row') // not the error: its message quotes the cell
    throw new ImportError('bad_row')
  }
}
