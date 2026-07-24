import type { jsPDF } from 'jspdf'
import type { AwayMap, Household } from '../types'
import {
  buildMonthlyCalendars,
  buildWeeklyExport,
  type ExportFormat,
} from './calendarExport'

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

function drawWeeklyPdf(
  doc: jsPDF,
  household: Household,
  away: AwayMap,
  from: string,
  until: string,
) {
  const rows = buildWeeklyExport(household, away, from, until)
  const people = household.people
  const margin = 12
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const usableWidth = pageWidth - margin * 2
  const weekCol = Math.min(42, usableWidth * 0.18)
  const personCol =
    people.length > 0 ? (usableWidth - weekCol) / people.length : usableWidth

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.text('Flat Chores — weekly rota', margin, 16)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text(`${from} → ${until}`, margin, 22)

  let y = 28
  const headerHeight = 8
  const drawHeader = () => {
    doc.setFillColor(243, 244, 246)
    doc.rect(margin, y, usableWidth, headerHeight, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.text('Week', margin + 2, y + 5.5)
    people.forEach((person, index) => {
      const x = margin + weekCol + index * personCol
      doc.text(person.name, x + 1.5, y + 5.5, {
        maxWidth: personCol - 3,
      })
    })
    y += headerHeight
  }

  drawHeader()

  for (const row of rows) {
    const cellLines: string[][] = people.map((person) => {
      const cell = row.cells[person.id]
      if (!cell || cell.status === 'empty') {
        return ['—']
      }
      if (cell.status === 'holiday') {
        return [cell.holidayLabel ?? 'Holiday']
      }
      return cell.choreNames
    })

    const lineHeight = 3.6
    const padding = 2
    const maxLines = Math.max(
      2,
      ...cellLines.map((lines) => lines.length),
      1,
    )
    const rowHeight = padding * 2 + maxLines * lineHeight

    if (y + rowHeight > pageHeight - 12) {
      doc.addPage()
      y = margin
      drawHeader()
    }

    doc.setDrawColor(209, 213, 219)
    doc.rect(margin, y, weekCol, rowHeight)
    people.forEach((_, index) => {
      const x = margin + weekCol + index * personCol
      doc.rect(x, y, personCol, rowHeight)
    })

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7.5)
    doc.text(row.label, margin + 1.5, y + 4, { maxWidth: weekCol - 3 })
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6.5)
    doc.setTextColor(100)
    doc.text(row.weekKey, margin + 1.5, y + 8)
    doc.setTextColor(0)

    cellLines.forEach((lines, index) => {
      const x = margin + weekCol + index * personCol + 1.5
      doc.setFontSize(7)
      lines.forEach((line, lineIndex) => {
        doc.text(line, x, y + padding + 3 + lineIndex * lineHeight, {
          maxWidth: personCol - 3,
        })
      })
    })

    y += rowHeight
  }
}

function drawMonthlyPdf(
  doc: jsPDF,
  household: Household,
  away: AwayMap,
  from: string,
  until: string,
) {
  const months = buildMonthlyCalendars(household, away, from, until)
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 10

  months.forEach((month, monthIndex) => {
    if (monthIndex > 0) {
      doc.addPage()
    }

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(16)
    doc.text(`Flat Chores — ${month.label}`, margin, 14)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.text(
      'Weekend chores on Sat/Sun · Cardboard on Wed (Tue night / Wed morning)',
      margin,
      19,
    )

    const top = 24
    const gridWidth = pageWidth - margin * 2
    const gridHeight = pageHeight - top - 10
    const colWidth = gridWidth / 7
    const rowCount = Math.max(month.weeks.length, 1)

    DAY_NAMES.forEach((name, index) => {
      const x = margin + index * colWidth
      doc.setFillColor(243, 244, 246)
      doc.rect(x, top, colWidth, 7, 'F')
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(8)
      doc.text(name, x + 2, top + 5)
    })

    const bodyTop = top + 7
    const bodyHeight = gridHeight - 7
    const bodyRowHeight = bodyHeight / rowCount

    month.weeks.forEach((week, weekIndex) => {
      week.forEach((date, dayIndex) => {
        const x = margin + dayIndex * colWidth
        const y = bodyTop + weekIndex * bodyRowHeight
        const inMonth = date.startsWith(
          `${month.year}-${String(month.month).padStart(2, '0')}-`,
        )

        doc.setDrawColor(209, 213, 219)
        if (!inMonth) {
          doc.setFillColor(250, 250, 250)
          doc.rect(x, y, colWidth, bodyRowHeight, 'FD')
        } else {
          doc.rect(x, y, colWidth, bodyRowHeight)
        }

        const dayNum = Number(date.slice(8, 10))
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(8)
        doc.setTextColor(inMonth ? 0 : 160)
        doc.text(String(dayNum), x + 2, y + 4)
        doc.setTextColor(0)

        if (!inMonth || date < from || date > until) {
          return
        }

        const entries = month.entriesByDate[date] ?? []
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(5.8)
        let textY = y + 8
        const maxY = y + bodyRowHeight - 2
        for (const entry of entries) {
          if (textY > maxY) {
            doc.text('…', x + 1.5, textY)
            break
          }
          const line =
            entry.kind === 'holiday'
              ? `${entry.personName}: ${entry.text}`
              : `${entry.personName}: ${entry.text}`
          doc.setTextColor(entry.kind === 'holiday' ? 80 : 20)
          doc.text(line, x + 1.5, textY, { maxWidth: colWidth - 3 })
          textY += 3.1
          if (entry.note && textY <= maxY) {
            doc.setTextColor(110)
            doc.text(entry.note, x + 1.5, textY, { maxWidth: colWidth - 3 })
            textY += 3.1
          }
        }
        doc.setTextColor(0)
      })
    })
  })
}

export async function downloadChoresPdf(options: {
  household: Household
  away: AwayMap
  format: ExportFormat
  from: string
  until: string
}): Promise<void> {
  const { household, away, format, from, until } = options
  if (until < from) {
    throw new Error('End date must be on or after the start date.')
  }

  const { jsPDF } = await import('jspdf')
  const landscape = format === 'weekly' || household.people.length > 4
  const doc = new jsPDF({
    orientation: landscape ? 'landscape' : 'portrait',
    unit: 'mm',
    format: 'a4',
  })

  if (format === 'monthly') {
    drawMonthlyPdf(doc, household, away, from, until)
  } else {
    drawWeeklyPdf(doc, household, away, from, until)
  }

  const blob = doc.output('blob')
  downloadBlob(`flat-chores-${format}-${from}_to_${until}.pdf`, blob)
}
