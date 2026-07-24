import { jsPDF } from 'jspdf'
import type { AwayMap, Household } from '../types'
import {
  buildMonthlyDateGrids,
  buildWeeklyExport,
  WEEKEND_CHORE_NOTE,
  type ExportFormat,
} from './calendarExport'

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

function drawTitleBlock(
  doc: jsPDF,
  title: string,
  subtitle: string,
  margin: number,
  contentWidth: number,
) {
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.setTextColor(0)
  doc.text(title, margin, 14)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text(subtitle, margin, 20)
  doc.setTextColor(70)
  const noteLines = doc.splitTextToSize(WEEKEND_CHORE_NOTE, contentWidth)
  doc.text(noteLines, margin, 25)
  doc.setTextColor(0)
  return 25 + noteLines.length * 4 + 4
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

  let y = drawTitleBlock(
    doc,
    'Flat Chores — weekly rota',
    `${from} → ${until}`,
    margin,
    usableWidth,
  )

  const headerHeight = 8
  const drawHeader = () => {
    doc.setFillColor(243, 244, 246)
    doc.rect(margin, y, usableWidth, headerHeight, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(0)
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
    doc.setTextColor(0)
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
  const months = buildMonthlyDateGrids(household, away, from, until)
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 10

  months.forEach((month, monthIndex) => {
    if (monthIndex > 0) {
      doc.addPage()
    }

    const usableWidth = pageWidth - margin * 2
    let y = drawTitleBlock(
      doc,
      `Flat Chores — ${month.label}`,
      'Dates × people · chore day grid',
      margin,
      usableWidth,
    )

    const dateCol = Math.min(28, usableWidth * 0.16)
    const personCol =
      month.people.length > 0
        ? (usableWidth - dateCol) / month.people.length
        : usableWidth
    const headerHeight = 8

    const drawHeader = () => {
      doc.setFillColor(243, 244, 246)
      doc.rect(margin, y, usableWidth, headerHeight, 'F')
      doc.setDrawColor(209, 213, 219)
      doc.rect(margin, y, dateCol, headerHeight)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(8)
      doc.setTextColor(0)
      doc.text('Date', margin + 2, y + 5.5)
      month.people.forEach((person, index) => {
        const x = margin + dateCol + index * personCol
        doc.rect(x, y, personCol, headerHeight)
        doc.text(person.name, x + 1.5, y + 5.5, { maxWidth: personCol - 3 })
      })
      y += headerHeight
    }

    drawHeader()

    if (month.rows.length === 0) {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      doc.setTextColor(120)
      doc.text('No chore days in this month for the selected range.', margin, y + 6)
      doc.setTextColor(0)
      return
    }

    for (const row of month.rows) {
      const cellLines = month.people.map((person) => {
        const cell = row.cells[person.id]
        if (!cell) {
          return ['—']
        }
        if (cell.kind === 'holiday') {
          return [`Away: ${cell.text}`]
        }
        return cell.note ? [cell.text, cell.note] : [cell.text]
      })

      const lineHeight = 3.4
      const padding = 2
      const maxLines = Math.max(1, ...cellLines.map((lines) => lines.length))
      const rowHeight = Math.max(8, padding * 2 + maxLines * lineHeight)

      if (y + rowHeight > pageHeight - 10) {
        doc.addPage()
        y = margin
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(11)
        doc.text(`${month.label} (continued)`, margin, y)
        y += 6
        drawHeader()
      }

      doc.setDrawColor(209, 213, 219)
      doc.rect(margin, y, dateCol, rowHeight)
      month.people.forEach((_, index) => {
        const x = margin + dateCol + index * personCol
        doc.rect(x, y, personCol, rowHeight)
      })

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(7.5)
      doc.setTextColor(0)
      doc.text(row.dateLabel, margin + 1.5, y + 4.5, {
        maxWidth: dateCol - 3,
      })

      cellLines.forEach((lines, index) => {
        const x = margin + dateCol + index * personCol + 1.5
        const cell = row.cells[month.people[index]?.id ?? '']
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(7)
        doc.setTextColor(cell?.kind === 'holiday' ? 90 : lines[0] === '—' ? 160 : 0)
        lines.forEach((line, lineIndex) => {
          doc.text(line, x, y + padding + 3 + lineIndex * lineHeight, {
            maxWidth: personCol - 3,
          })
        })
      })
      doc.setTextColor(0)
      y += rowHeight
    }
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

  // Both formats are wide tables (people as columns).
  const doc = new jsPDF({
    orientation: 'landscape',
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
