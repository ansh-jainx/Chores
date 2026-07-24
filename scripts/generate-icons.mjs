import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateSync } from 'node:zlib'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outputDir = resolve(root, 'public', 'icons')
const colors = {
  slate: [15, 23, 42, 255],
  slateSoft: [30, 41, 59, 255],
  teal: [15, 118, 110, 255],
  tealBright: [20, 184, 166, 255],
  mint: [204, 251, 241, 255],
  white: [248, 250, 252, 255],
  shadow: [2, 6, 23, 80],
}
const crcTable = Array.from({ length: 256 }, (_, index) => {
  let crc = index
  for (let bit = 0; bit < 8; bit += 1) {
    crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1
  }
  return crc >>> 0
})

mkdirSync(outputDir, { recursive: true })

for (const size of [192, 512]) {
  writeFileSync(resolve(outputDir, `icon-${size}.png`), png(renderIcon(size), size, size))
}

function renderIcon(size) {
  const scale = 3
  const hiSize = size * scale
  const buffer = new Uint8Array(hiSize * hiSize * 4)
  const unit = hiSize / 512

  fillRoundedRect(buffer, hiSize, 0, 0, 512, 512, 112, colors.slate, unit)
  fillCircle(buffer, hiSize, 256, 256, 190, colors.teal, unit)
  fillCircle(buffer, hiSize, 182, 142, 82, [20, 184, 166, 120], unit)
  strokeLine(buffer, hiSize, 366, 108, 182, 400, 34, colors.slateSoft, unit)
  strokeLine(buffer, hiSize, 366, 108, 182, 400, 16, colors.mint, unit)
  fillPolygon(
    buffer,
    hiSize,
    [
      [154, 226],
      [358, 226],
      [326, 406],
      [186, 406],
    ],
    colors.shadow,
    unit,
    10,
    16,
  )
  fillPolygon(
    buffer,
    hiSize,
    [
      [154, 216],
      [358, 216],
      [326, 396],
      [186, 396],
    ],
    colors.mint,
    unit,
  )
  fillRoundedRect(buffer, hiSize, 138, 198, 236, 54, 24, colors.white, unit)
  fillRoundedRect(buffer, hiSize, 194, 154, 124, 44, 20, colors.slate, unit)
  fillRoundedRect(buffer, hiSize, 214, 170, 84, 16, 8, colors.tealBright, unit)
  strokeLine(buffer, hiSize, 214, 314, 252, 352, 26, colors.slate, unit)
  strokeLine(buffer, hiSize, 252, 352, 330, 256, 26, colors.slate, unit)
  strokeLine(buffer, hiSize, 214, 314, 252, 352, 14, colors.tealBright, unit)
  strokeLine(buffer, hiSize, 252, 352, 330, 256, 14, colors.tealBright, unit)

  return downsample(buffer, size, scale)
}

function downsample(source, size, scale) {
  const hiSize = size * scale
  const target = new Uint8Array(size * size * 4)
  const samples = scale * scale

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const rgba = [0, 0, 0, 0]
      for (let sy = 0; sy < scale; sy += 1) {
        for (let sx = 0; sx < scale; sx += 1) {
          const sourceIndex = ((y * scale + sy) * hiSize + (x * scale + sx)) * 4
          rgba[0] += source[sourceIndex]
          rgba[1] += source[sourceIndex + 1]
          rgba[2] += source[sourceIndex + 2]
          rgba[3] += source[sourceIndex + 3]
        }
      }

      const targetIndex = (y * size + x) * 4
      target[targetIndex] = Math.round(rgba[0] / samples)
      target[targetIndex + 1] = Math.round(rgba[1] / samples)
      target[targetIndex + 2] = Math.round(rgba[2] / samples)
      target[targetIndex + 3] = Math.round(rgba[3] / samples)
    }
  }

  return target
}

function fillRoundedRect(buffer, canvasSize, x, y, width, height, radius, color, unit) {
  drawShape(buffer, canvasSize, x, y, x + width, y + height, color, unit, (px, py) => {
    const dx = Math.max(x + radius - px, 0, px - (x + width - radius))
    const dy = Math.max(y + radius - py, 0, py - (y + height - radius))
    return dx * dx + dy * dy <= radius * radius
  })
}

function fillCircle(buffer, canvasSize, cx, cy, radius, color, unit) {
  drawShape(buffer, canvasSize, cx - radius, cy - radius, cx + radius, cy + radius, color, unit, (px, py) => {
    const dx = px - cx
    const dy = py - cy
    return dx * dx + dy * dy <= radius * radius
  })
}

function fillPolygon(buffer, canvasSize, points, color, unit, offsetX = 0, offsetY = 0) {
  const shifted = points.map(([x, y]) => [x + offsetX, y + offsetY])
  const xs = shifted.map(([x]) => x)
  const ys = shifted.map(([, y]) => y)
  drawShape(
    buffer,
    canvasSize,
    Math.min(...xs),
    Math.min(...ys),
    Math.max(...xs),
    Math.max(...ys),
    color,
    unit,
    (px, py) => insidePolygon(px, py, shifted),
  )
}

function strokeLine(buffer, canvasSize, x1, y1, x2, y2, width, color, unit) {
  const radius = width / 2
  drawShape(
    buffer,
    canvasSize,
    Math.min(x1, x2) - radius,
    Math.min(y1, y2) - radius,
    Math.max(x1, x2) + radius,
    Math.max(y1, y2) + radius,
    color,
    unit,
    (px, py) => distanceToSegment(px, py, x1, y1, x2, y2) <= radius,
  )
}

function drawShape(buffer, canvasSize, minX, minY, maxX, maxY, color, unit, contains) {
  const startX = Math.max(0, Math.floor(minX * unit))
  const startY = Math.max(0, Math.floor(minY * unit))
  const endX = Math.min(canvasSize - 1, Math.ceil(maxX * unit))
  const endY = Math.min(canvasSize - 1, Math.ceil(maxY * unit))

  for (let y = startY; y <= endY; y += 1) {
    for (let x = startX; x <= endX; x += 1) {
      const px = (x + 0.5) / unit
      const py = (y + 0.5) / unit
      if (contains(px, py)) {
        blend(buffer, (y * canvasSize + x) * 4, color)
      }
    }
  }
}

function blend(buffer, index, color) {
  const alpha = color[3] / 255
  const inverse = 1 - alpha
  buffer[index] = Math.round(color[0] * alpha + buffer[index] * inverse)
  buffer[index + 1] = Math.round(color[1] * alpha + buffer[index + 1] * inverse)
  buffer[index + 2] = Math.round(color[2] * alpha + buffer[index + 2] * inverse)
  buffer[index + 3] = Math.round(color[3] + buffer[index + 3] * inverse)
}

function insidePolygon(x, y, points) {
  let inside = false

  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const [xi, yi] = points[i]
    const [xj, yj] = points[j]
    const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi
    if (intersects) inside = !inside
  }

  return inside
}

function distanceToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1
  const dy = y2 - y1
  const lengthSquared = dx * dx + dy * dy
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lengthSquared))
  const x = x1 + t * dx
  const y = y1 + t * dy
  return Math.hypot(px - x, py - y)
}

function png(rgba, width, height) {
  const rowLength = width * 4 + 1
  const raw = Buffer.alloc(rowLength * height)

  for (let y = 0; y < height; y += 1) {
    raw[y * rowLength] = 0
    Buffer.from(rgba.subarray(y * width * 4, (y + 1) * width * 4)).copy(raw, y * rowLength + 1)
  }

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr(width, height)),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

function ihdr(width, height) {
  const buffer = Buffer.alloc(13)
  buffer.writeUInt32BE(width, 0)
  buffer.writeUInt32BE(height, 4)
  buffer[8] = 8
  buffer[9] = 6
  buffer[10] = 0
  buffer[11] = 0
  buffer[12] = 0
  return buffer
}

function chunk(type, data) {
  const name = Buffer.from(type)
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length, 0)
  const checksum = Buffer.alloc(4)
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])), 0)
  return Buffer.concat([length, name, data, checksum])
}

function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}
