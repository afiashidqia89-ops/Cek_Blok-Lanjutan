'use client'

/**
 * Helper Excel (XLSX) sisi browser untuk halaman web Cek Blok.
 * Memakai ExcelJS yang sudah tersedia sebagai aset statis /app/exceljs.min.js
 * (berkas yang sama dipakai aplikasi HP) — TANPA menambah dependensi npm.
 */

declare global {
  interface Window {
    ExcelJS?: {
      Workbook: new () => ExcelWorkbook
    }
  }
}

export interface ExcelSheetImage {
  /** Data URL foto (data:image/jpeg;base64,....) */
  dataUrl: string
  /** Posisi 0-based: row 0 = baris header, col 0 = kolom pertama */
  row: number
  col: number
  width: number
  height: number
}

export interface ExcelWorksheet {
  name: string
  columns: { header: string; key: string; width?: number }[]
  rows: Record<string, unknown>[]
  /** Gaya khusus per sel: { "B3": { numFmt: "0.00" } } */
  cellStyles?: Record<string, { numFmt?: string; bold?: boolean; fill?: string; fontColor?: string }>
  /** Isi status diwarnai otomatis: BAIK hijau, PERLU PERBAIKAN kuning, PRIORITAS TINGGI merah */
  colorStatusKey?: string
  /** Foto yang ditanam ke sel (dipakai sheet Detail Temuan + Foto) */
  images?: ExcelSheetImage[]
  /** Tinggi baris ekstra (poin, kunci = nomor baris ExcelJS 1-based) */
  rowHeights?: Record<number, number>
}

export interface ExcelWorkbook {
  creator: string
  created: Date
  addWorksheet(name: string, opts?: { views?: { state: string; ySplit: number }[] }): ExcelWs
  worksheets: ExcelWs[]
  addImage(img: { base64: string; extension: string }): number
  xlsx: { writeBuffer(): Promise<ArrayBuffer>; load(buf: ArrayBuffer): Promise<void> }
}

export interface ExcelWs {
  name: string
  rowCount: number
  columns: { header: string; key: string; width?: number }[]
  addRow(v: Record<string, unknown>): ExcelRow
  getRow(n: number): ExcelRow
  addImage(imgId: number, anchor: { tl: { col: number; row: number }; ext: { width: number; height: number }; editAs?: string }): void
}

export interface ExcelHeadRow {
  eachCell(cb: (c: ExcelCell, colNumber: number) => void): void
}

export interface ExcelRow {
  eachCell(opts: { includeEmpty: boolean } | ((c: ExcelCell, colNumber?: number) => void), cb?: (c: ExcelCell, colNumber?: number) => void): void
  getCell(key: string | number): ExcelCell
  height?: number
  number: number
}

export interface ExcelCell {
  font?: { bold?: boolean; color?: { argb: string } }
  fill?: { type: string; pattern: string; fgColor: { argb: string } }
  alignment?: { vertical?: string; horizontal?: string; wrapText?: boolean }
  border?: Record<string, { style: string; color?: { argb: string } }>
  numFmt?: string
  value?: unknown
}

let pending: Promise<void> | null = null

/** Muat ExcelJS dari aset statis (sekali saja). Gagal = lempar error jelas. */
export function ensureExcelJS(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('Hanya di browser'))
  if (window.ExcelJS) return Promise.resolve()
  if (pending) return pending
  pending = new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = '/app/exceljs.min.js'
    s.async = true
    s.onload = () => {
      if (window.ExcelJS) resolve()
      else {
        pending = null
        reject(new Error('Pustaka Excel tidak aktif — coba muat ulang halaman'))
      }
    }
    s.onerror = () => {
      pending = null
      reject(new Error('Gagal memuat pustaka Excel (/app/exceljs.min.js tidak ada)'))
    }
    document.head.appendChild(s)
  })
  return pending
}

export interface ParsedXlsx {
  headers: string[]
  rows: Record<string, unknown>[]
  sheetName: string
}

/** Baca berkas .xlsx → baris-baris objek berdasarkan header baris pertama */
export async function parseXlsx(file: File, sheetIndex = 0): Promise<ParsedXlsx> {
  await ensureExcelJS()
  const ExcelJS = window.ExcelJS!
  const wb = new ExcelJS.Workbook()
  const buf = await file.arrayBuffer()
  await wb.xlsx.load(buf as never)
  const ws = wb.worksheets?.[sheetIndex]
  if (!ws || ws.rowCount < 1) throw new Error('Berkas Excel kosong / tidak terbaca')
  const headers: string[] = []
  const headRow = ws.getRow(1) as unknown as ExcelHeadRow
  headRow.eachCell((cell, colNumber) => {
    headers[colNumber] = String(cell?.value ?? '').trim()
  })
  const rows: Record<string, unknown>[] = []
  for (let i = 2; i <= ws.rowCount; i++) {
    const r = ws.getRow(i)
    const obj: Record<string, unknown> = {}
    let ada = false
    headers.forEach((h, idx) => {
      if (!h) return
      const v = r.getCell(idx).value
      let val: unknown = v
      if (v && typeof v === 'object' && 'text' in (v as Record<string, unknown>)) {
        val = (v as { text?: unknown }).text // sel hyperlink
      } else if (v && typeof v === 'object' && 'result' in (v as Record<string, unknown>)) {
        val = (v as { result?: unknown }).result // sel formula
      } else if (v instanceof Date) {
        val = v.toISOString().slice(0, 10)
      }
      obj[h] = val instanceof Date ? val.toISOString().slice(0, 10) : val
      if (val !== null && val !== undefined && val !== '') ada = true
    })
    if (ada) rows.push(obj)
  }
  return { headers: headers.filter(Boolean), rows, sheetName: ws.name || 'Sheet1' }
}

/** Cari kolom by beberapa kemungkinan nama header (tanpa peduli besar-kecil) */
export function pickCol(
  row: Record<string, unknown>,
  names: string[]
): string {
  const keys = Object.keys(row)
  for (const n of names) {
    const k = keys.find((key) => key.toLowerCase().replace(/[^a-z0-9]+/g, '') === n.toLowerCase().replace(/[^a-z0-9]+/g, ''))
    if (k != null && String(row[k] ?? '').trim() !== '') return String(row[k]).trim()
  }
  return ''
}

/** Unduh workbook yang sudah dibuat */
export async function downloadWorkbook(wb: ExcelWorkbook, filename: string): Promise<void> {
  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
}

const BORDER = {
  top: { style: 'thin', color: { argb: 'FFA3A3A3' } },
  left: { style: 'thin', color: { argb: 'FFA3A3A3' } },
  bottom: { style: 'thin', color: { argb: 'FFA3A3A3' } },
  right: { style: 'thin', color: { argb: 'FFA3A3A3' } },
}

const STATUS_FILL: Record<string, string> = {
  BAIK: 'FFDCFCE7',
  'PERLU PERBAIKAN': 'FFFEF3C7',
  'PRIORITAS TINGGI': 'FFFEE2E2',
}

/** Buat workbook + tulis beberapa sheet sekaligus (gaya sama seperti ekspor aplikasi HP) */
export async function buildWorkbook(sheets: ExcelWorksheet[], creator = 'Server Cek Blok'): Promise<ExcelWorkbook> {
  await ensureExcelJS()
  const ExcelJS = window.ExcelJS!
  const wb = new ExcelJS.Workbook()
  wb.creator = creator
  wb.created = new Date()
  for (const sh of sheets) {
    const ws = wb.addWorksheet(sh.name, { views: [{ state: 'frozen', ySplit: 1 }] })
    ws.columns = sh.columns
    const head = ws.getRow(1)
    head.height = 24
    head.eachCell((c) => {
      c.font = { bold: true, color: { argb: 'FFFFFFFF' } }
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF14532D' } }
      c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
      c.border = BORDER
    })
    for (const r of sh.rows) {
      const row = ws.addRow(r)
      row.eachCell({ includeEmpty: true }, (c) => {
        c.border = BORDER
        c.alignment = { vertical: 'top', wrapText: true }
      })
      if (sh.cellStyles) {
        for (const [addr, st] of Object.entries(sh.cellStyles)) {
          if (typeof addr !== 'string' || !addr) continue
          const cell = row.getCell(addr)
          if (!cell) continue
          if (st.numFmt) cell.numFmt = st.numFmt
          if (st.bold) cell.font = { bold: true }
        }
      }
      if (sh.colorStatusKey) {
        const v = String(r[sh.colorStatusKey] ?? '').toUpperCase()
        const fill = STATUS_FILL[v]
        if (fill) row.getCell(sh.colorStatusKey).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } }
      }
    }
    // Tinggi baris ekstra (mis. baris yang memuat foto)
    if (sh.rowHeights) {
      for (const [rn, h] of Object.entries(sh.rowHeights)) {
        try { ws.getRow(Number(rn)).height = h } catch { /* abaikan */ }
      }
    }
    // Tanam foto (sama seperti ekspor aplikasi HP: anchor kiri-atas kolom Foto)
    if (sh.images?.length) {
      for (const im of sh.images) {
        const ext = /image\/png/i.test(im.dataUrl) ? 'png' : 'jpeg'
        const b64 = im.dataUrl.slice(im.dataUrl.indexOf(',') + 1)
        if (!b64) continue
        try {
          const id = wb.addImage({ base64: b64, extension: ext })
          ws.addImage(id, {
            tl: { col: im.col + 0.03, row: im.row + 0.04 },
            ext: { width: im.width, height: im.height },
            editAs: 'oneCell',
          })
        } catch { /* foto korup -> lewati, baris tetap terisi teks */ }
      }
    }
  }
  return wb
}
