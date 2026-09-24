/**
 * CSV generation for the monthly export.
 *
 * Two things here are not decoration. Fields are quoted per RFC 4180 so a
 * reflection containing a comma, a quote or a newline cannot shift every
 * later column. And a leading =, +, - or @ is defused, because a spreadsheet
 * treats such a cell as a formula: text an intern typed into "what I learned"
 * would otherwise be executed by Excel on the machine of whoever opens the
 * export. Prefixing with an apostrophe keeps the text visible and inert.
 */

const RISKY = /^[=+\-@\t\r]/

function cell(value: unknown): string {
  if (value === null || value === undefined) return ''
  let s = String(value)
  if (RISKY.test(s)) s = `'${s}`
  if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`
  return s
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map(cell).join(','), ...rows.map((r) => r.map(cell).join(','))]
  // CRLF per the spec, and a BOM so Excel reads it as UTF-8 rather than
  // mangling any non-ASCII name in the roster.
  return '﻿' + lines.join('\r\n') + '\r\n'
}

export function downloadCsv(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Freeing it immediately can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
