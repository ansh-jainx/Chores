import { jsPDF } from 'jspdf'
import type { AwayMap, Household } from '../types'
import {
  buildMonthlyPersonSchedules,
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
  const months = buildMonthlyPersonSchedules(household, away, from, until)
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 14
  const contentWidth = pageWidth - margin * 2

  months.forEach((month, monthIndex) => {
    if (monthIndex > 0) {
      doc.addPage()
    }

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(18)
    doc.text(`Flat Chores — ${month.label}`, margin, 18)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(70)
    const noteLines = doc.splitTextToSize(WEEKEND_CHORE_NOTE, contentWidth)
    doc.text(noteLines, margin, 25)
    doc.setTextColor(0)

    let y = 25 + noteLines.length * 4 + 6

    for (const person of month.people) {
      const blockHeight =
        8 + Math.max(person.items.length, 1) * 5.2 + 6

      if (y + Math.min(blockHeight, 20) > pageHeight - 12) {
        doc.addPage()
        y = margin
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(12)
        doc.text(`${month.label} (continued)`, margin, y)
        y += 8
      }

      doc.setFillColor(240, 253, 250)
      doc.rect(margin, y, contentWidth, 7, 'F')
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(12)
      doc.text(person.personName, margin + 2, y + 5)
      y += 10

      if (person.items.length === 0) {
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(9)
        doc.setTextColor(120)
        doc.text('No chores this month', margin + 2, y)
        doc.setTextColor(0)
        y += 8
        continue
      }

      for (const item of person.items) {
        if (y > pageHeight - 12) {
          doc.addPage()
          y = margin
          doc.setFont('helvetica', 'bold')
          doc.setFontSize(11)
          doc.text(`${person.personName} (continued)`, margin, y)
          y += 8
        }

        doc.setFont('helvetica', 'bold')
        doc.setFontSize(9)
        doc.setTextColor(item.kind === 'holiday' ? 90 : 0)
        doc.text(item.dateLabel, margin + 2, y)

        doc.setFont('helvetica', 'normal')
        const detail =
          item.kind === 'holiday'
            ? `Away — ${item.choreName}`
            : item.note
              ? `${item.choreName} (${item.note})`
              : item.choreName
        doc.text(detail, margin + 32, y, { maxWidth: contentWidth - 34 })
        doc.setTextColor(0)
        y += 5.2
      }

      y += 6
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

  const landscape = format === 'weekly'
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
