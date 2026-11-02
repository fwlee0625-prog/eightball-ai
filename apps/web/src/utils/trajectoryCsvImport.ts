import { parseTrajectoryJson } from '@/utils/trajectoryImport'
import type { TrajectoryBallState, TrajectoryFrame, TrajectoryRecord } from '@/types/trajectory'

const REQUIRED_COLUMNS = [
  'schema_version',
  'trajectory_id',
  'match_id',
  'rack_id',
  'shot_id',
  'table_id',
  'state_version',
  'source',
  'nominal_fps',
  'active_length_mm',
  'active_width_mm',
  'frame_index',
  'timestamp_ns',
  'ball_id',
  'x_mm',
  'y_mm',
  'provenance_kind',
  'provenance_description',
] as const

const OPTIONAL_COLUMNS = ['confidence'] as const
const ALLOWED_COLUMNS = new Set<string>([...REQUIRED_COLUMNS, ...OPTIONAL_COLUMNS])

type CsvMetadata = {
  schema_version: string
  trajectory_id: string
  match_id: string
  rack_id: string
  shot_id: string
  table_id: string
  state_version: number
  source: string
  nominal_fps: number
  active_length_mm: number
  active_width_mm: number
  provenance_kind: string
  provenance_description: string
}

type CsvRow = {
  values: string[]
  line: number
}

function parseCsvRows(input: string): CsvRow[] {
  const source = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input
  const rows: CsvRow[] = []
  let currentRow: string[] = []
  let currentField = ''
  let inQuotes = false
  let quoteClosed = false
  let line = 1
  let rowStartLine = 1
  let index = 0

  const finishRow = () => {
    currentRow.push(currentField)
    if (currentRow.some((value) => value.trim().length > 0)) {
      rows.push({ values: currentRow, line: rowStartLine })
    }
    currentRow = []
    currentField = ''
    quoteClosed = false
  }

  while (index < source.length) {
    const char = source[index]!

    if (inQuotes) {
      if (char === '"') {
        if (source[index + 1] === '"') {
          currentField += '"'
          index += 2
          continue
        }
        inQuotes = false
        quoteClosed = true
        index += 1
        continue
      }
      if (char === '\r') {
        currentField += '\n'
        if (source[index + 1] === '\n') index += 1
        line += 1
        index += 1
        continue
      }
      if (char === '\n') {
        currentField += '\n'
        line += 1
        index += 1
        continue
      }
      currentField += char
      index += 1
      continue
    }

    if (quoteClosed) {
      if (char === ',') {
        currentRow.push(currentField)
        currentField = ''
        quoteClosed = false
        index += 1
        continue
      }
      if (char === '\r' || char === '\n') {
        finishRow()
        if (char === '\r' && source[index + 1] === '\n') index += 1
        line += 1
        rowStartLine = line
        index += 1
        continue
      }
      if (char === ' ' || char === '\t') {
        index += 1
        continue
      }
      throw new Error('CSV 第 ' + line + ' 行存在引号后的多余字符。')
    }

    if (char === '"') {
      if (currentField.length !== 0) {
        throw new Error('CSV 第 ' + line + ' 行字段中的引号位置无效。')
      }
      inQuotes = true
      index += 1
      continue
    }
    if (char === ',') {
      currentRow.push(currentField)
      currentField = ''
      index += 1
      continue
    }
    if (char === '\r' || char === '\n') {
      finishRow()
      if (char === '\r' && source[index + 1] === '\n') index += 1
      line += 1
      rowStartLine = line
      index += 1
      continue
    }

    currentField += char
    index += 1
  }

  if (inQuotes) throw new Error('CSV 存在未闭合的引号。')
  if (currentField.length > 0 || currentRow.length > 0 || quoteClosed) finishRow()
  return rows
}

function cell(row: CsvRow, columnIndexes: Map<string, number>, column: string): string {
  const index = columnIndexes.get(column)
  return index === undefined ? '' : row.values[index] ?? ''
}

function requiredText(row: CsvRow, columnIndexes: Map<string, number>, column: string): string {
  const value = cell(row, columnIndexes, column).trim()
  if (!value) {
    throw new Error('CSV 第 ' + row.line + ' 行的 ' + column + ' 不能为空。')
  }
  return value
}

function finiteNumber(row: CsvRow, columnIndexes: Map<string, number>, column: string): number {
  const raw = requiredText(row, columnIndexes, column)
  if (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(raw)) {
    throw new Error('CSV 第 ' + row.line + ' 行的 ' + column + ' 必须是十进制数字。')
  }
  const value = Number(raw)
  if (!Number.isFinite(value)) {
    throw new Error('CSV 第 ' + row.line + ' 行的 ' + column + ' 必须是有限数字。')
  }
  return value
}

function safeInteger(
  row: CsvRow,
  columnIndexes: Map<string, number>,
  column: string,
  minimum: number,
): number {
  const value = finiteNumber(row, columnIndexes, column)
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new Error(
      'CSV 第 ' + row.line + ' 行的 ' + column + ' 必须是大于等于 ' + minimum + ' 的安全整数。',
    )
  }
  return value
}

function readMetadata(row: CsvRow, columnIndexes: Map<string, number>): CsvMetadata {
  const metadata: CsvMetadata = {
    schema_version: requiredText(row, columnIndexes, 'schema_version'),
    trajectory_id: requiredText(row, columnIndexes, 'trajectory_id'),
    match_id: requiredText(row, columnIndexes, 'match_id'),
    rack_id: requiredText(row, columnIndexes, 'rack_id'),
    shot_id: requiredText(row, columnIndexes, 'shot_id'),
    table_id: requiredText(row, columnIndexes, 'table_id'),
    state_version: safeInteger(row, columnIndexes, 'state_version', 1),
    source: requiredText(row, columnIndexes, 'source'),
    nominal_fps: finiteNumber(row, columnIndexes, 'nominal_fps'),
    active_length_mm: finiteNumber(row, columnIndexes, 'active_length_mm'),
    active_width_mm: finiteNumber(row, columnIndexes, 'active_width_mm'),
    provenance_kind: requiredText(row, columnIndexes, 'provenance_kind'),
    provenance_description: requiredText(row, columnIndexes, 'provenance_description'),
  }
  if (metadata.schema_version !== '0.1.0') {
    throw new Error('CSV 第 ' + row.line + ' 行的 schema_version 必须为 0.1.0。')
  }
  return metadata
}

const METADATA_KEYS: (keyof CsvMetadata)[] = [
  'schema_version',
  'trajectory_id',
  'match_id',
  'rack_id',
  'shot_id',
  'table_id',
  'state_version',
  'source',
  'nominal_fps',
  'active_length_mm',
  'active_width_mm',
  'provenance_kind',
  'provenance_description',
]

function assertMetadataConsistent(base: CsvMetadata, next: CsvMetadata, line: number): void {
  for (const key of METADATA_KEYS) {
    if (base[key] !== next[key]) {
      throw new Error('CSV 第 ' + line + ' 行的 ' + key + ' 与前面记录不一致。')
    }
  }
}

/**
 * Convert flat per-detection CSV rows to the v0.1.0 trajectory contract.
 * Frame gaps and recorded timestamps are preserved; no missing detections are inferred.
 */
export function parseTrajectoryCsv(csv: string): TrajectoryRecord {
  const rows = parseCsvRows(csv)
  if (rows.length === 0) throw new Error('CSV 文件为空，缺少表头。')

  const headers = rows[0]!.values.map((header) => header.trim())
  const seenHeaders = new Set<string>()
  for (const header of headers) {
    if (!header) throw new Error('CSV 表头不能包含空列名。')
    if (seenHeaders.has(header)) throw new Error('CSV 表头存在重复列 ' + header + '。')
    if (!ALLOWED_COLUMNS.has(header)) throw new Error('CSV 包含未知列 ' + header + '。')
    seenHeaders.add(header)
  }

  const columnIndexes = new Map<string, number>()
  headers.forEach((header, index) => columnIndexes.set(header, index))
  for (const column of REQUIRED_COLUMNS) {
    if (!columnIndexes.has(column)) throw new Error('CSV 缺少必需列 ' + column + '。')
  }

  const dataRows = rows.slice(1)
  if (dataRows.length === 0) throw new Error('CSV 至少需要两帧的检测记录。')

  let metadata: CsvMetadata | null = null
  const framesByIndex = new Map<number, TrajectoryFrame>()

  for (const row of dataRows) {
    if (row.values.length !== headers.length) {
      throw new Error('CSV 第 ' + row.line + ' 行的列数与表头不一致。')
    }

    const rowMetadata = readMetadata(row, columnIndexes)
    if (metadata === null) metadata = rowMetadata
    else assertMetadataConsistent(metadata, rowMetadata, row.line)

    const frameIndex = safeInteger(row, columnIndexes, 'frame_index', 0)
    const timestamp = safeInteger(row, columnIndexes, 'timestamp_ns', 0)
    const ballId = safeInteger(row, columnIndexes, 'ball_id', 0)
    const x = finiteNumber(row, columnIndexes, 'x_mm')
    const y = finiteNumber(row, columnIndexes, 'y_mm')
    const ball: TrajectoryBallState = { id: ballId, x_mm: x, y_mm: y }

    if (columnIndexes.has('confidence')) {
      const confidenceValue = cell(row, columnIndexes, 'confidence').trim()
      if (confidenceValue) {
        const confidence = finiteNumber(row, columnIndexes, 'confidence')
        ball.confidence = confidence
      }
    }

    const existingFrame = framesByIndex.get(frameIndex)
    if (existingFrame) {
      if (existingFrame.timestamp_ns !== timestamp) {
        throw new Error('CSV 第 ' + row.line + ' 行的 timestamp_ns 与同一 frame_index 的记录不一致。')
      }
      existingFrame.balls.push(ball)
    } else {
      framesByIndex.set(frameIndex, {
        frame_index: frameIndex,
        timestamp_ns: timestamp,
        balls: [ball],
      })
    }
  }

  if (metadata === null) throw new Error('CSV 至少需要两帧的检测记录。')

  const frames = [...framesByIndex.values()].sort((left, right) => left.frame_index - right.frame_index)
  const record = {
    schema_version: '0.1.0',
    trajectory_id: metadata.trajectory_id,
    match_id: metadata.match_id,
    rack_id: metadata.rack_id,
    shot_id: metadata.shot_id,
    table_id: metadata.table_id,
    state_version: metadata.state_version,
    source: metadata.source,
    timebase: {
      timestamp_unit: 'ns',
      timestamp_origin: 'shot_start',
      nominal_fps: metadata.nominal_fps,
    },
    coordinate_frame: {
      units: 'mm',
      origin: 'table_center',
      x_axis: 'table_width',
      y_axis: 'table_length',
      positive_x: 'inherited_from_vision',
      positive_y: 'inherited_from_vision',
      orientation_status: 'provisional',
    },
    table_geometry: {
      active_length_mm: metadata.active_length_mm,
      active_width_mm: metadata.active_width_mm,
    },
    frames,
    provenance: {
      kind: metadata.provenance_kind,
      description: metadata.provenance_description,
    },
  }

  return parseTrajectoryJson(JSON.stringify(record))
}
