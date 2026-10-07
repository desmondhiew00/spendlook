import { decode, parseCsv } from '../csv'
import type { AccountType, ParsedRow } from '../types'
import { isMufg, parseMufg } from './mufg'
import { isPaypay, parsePaypay } from './paypay'

export type ImportErrorCode = 'wrong_type_mufg' | 'wrong_type_paypay' | 'unknown_format'

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
  if (type === 'mufg' && isMufg(sjis)) return parseMufg(sjis)
  if (type === 'paypay' && isPaypay(utf8)) return parsePaypay(utf8)
  if (isPaypay(utf8)) throw new ImportError('wrong_type_paypay')
  if (isMufg(sjis)) throw new ImportError('wrong_type_mufg')
  throw new ImportError('unknown_format')
}
