import * as XLSX from 'xlsx'

export function downloadXLSX(rows, sheetName, filename) {
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet(rows)
  if (rows.length > 0) {
    ws['!cols'] = rows[0].map((_, ci) => ({
      wch: Math.min(40, Math.max(8, ...rows.slice(0, 300).map(r => String(r[ci] ?? '').length)) + 2),
    }))
  }
  XLSX.utils.book_append_sheet(wb, ws, sheetName)
  XLSX.writeFile(wb, filename)
}
