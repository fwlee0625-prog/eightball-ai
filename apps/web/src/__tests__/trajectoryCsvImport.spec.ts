import { describe, expect, it } from 'vitest'

import trajectoryFixture from '../../../../data/samples/trajectory-001.json'
import { parseTrajectoryCsv } from '../utils/trajectoryCsvImport'
import type { TrajectoryRecord } from '../types/trajectory'

const CSV_COLUMNS = [
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
  'confidence',
  'provenance_kind',
  'provenance_description',
] as const

function fixture(): TrajectoryRecord {
  return JSON.parse(JSON.stringify(trajectoryFixture)) as TrajectoryRecord
}

function escapeCsv(value: string | number | undefined): string {
  const text = value === undefined ? '' : String(value)
  if (text.includes(',') || text.includes('"') || text.includes('\n') || text.includes('\r')) {
    return '"' + text.replace(/"/g, '""') + '"'
  }
  return text
}

function toCsv(record = fixture(), includeConfidence = true): string {
  const columns = includeConfidence
    ? [...CSV_COLUMNS]
    : CSV_COLUMNS.filter((column) => column !== 'confidence')
  const rows: string[] = []

  for (const frame of record.frames) {
    for (const ball of frame.balls) {
      const values: Record<string, string | number | undefined> = {
        schema_version: record.schema_version,
        trajectory_id: record.trajectory_id,
        match_id: record.match_id,
        rack_id: record.rack_id,
        shot_id: record.shot_id,
        table_id: record.table_id,
        state_version: record.state_version,
        source: record.source,
        nominal_fps: record.timebase.nominal_fps,
        active_length_mm: record.table_geometry.active_length_mm,
        active_width_mm: record.table_geometry.active_width_mm,
        frame_index: frame.frame_index,
        timestamp_ns: frame.timestamp_ns,
        ball_id: ball.id,
        x_mm: ball.x_mm,
        y_mm: ball.y_mm,
        confidence: ball.confidence,
        provenance_kind: record.provenance.kind,
        provenance_description: record.provenance.description,
      }
      rows.push(columns.map((column) => escapeCsv(values[column])).join(','))
    }
  }
  return [columns.join(','), ...rows].join('\n')
}

function updateCell(csv: string, dataRowIndex: number, column: string, value: string): string {
  const lines = csv.split('\n')
  const headers = lines[0]!.split(',')
  const cells = lines[dataRowIndex + 1]!.split(',')
  const columnIndex = headers.indexOf(column)
  if (columnIndex < 0) throw new Error('Missing test CSV column: ' + column)
  cells[columnIndex] = value
  lines[dataRowIndex + 1] = cells.join(',')
  return lines.join('\n')
}

describe('trajectory CSV import', () => {
  it('converts flat detections to frames and preserves source indexes and timestamps', () => {
    const parsed = parseTrajectoryCsv(toCsv())
    expect(parsed.trajectory_id).toBe('synthetic-trajectory-001')
    expect(parsed.frames.map((frame) => frame.frame_index)).toEqual([0, 50, 100, 200, 250, 350])
    expect(parsed.frames.map((frame) => frame.timestamp_ns)).toEqual([
      0, 250_000_000, 500_000_000, 1_000_000_000, 1_250_000_000, 1_750_000_000,
    ])
    expect(parsed.frames[0]?.balls).toHaveLength(16)
    expect(parsed.frames[2]?.balls.find((ball) => ball.id === 0)).toMatchObject({
      x_mm: 55.272842,
      y_mm: -315.194031,
    })
  })

  it('supports a BOM, CRLF, escaped quotes, commas and newlines in quoted metadata', () => {
    const input = fixture()
    input.source = 'camera, "top" view\nleft'
    input.provenance.description = 'CSV, "quoted" description'
    const csv = '\uFEFF' + toCsv(input).split('\n').join('\r\n')
    const parsed = parseTrajectoryCsv(csv)
    expect(parsed.source).toBe('camera, "top" view\nleft')
    expect(parsed.provenance.description).toBe('CSV, "quoted" description')
  })

  it('allows the optional confidence column to be omitted and blank confidence to remain missing', () => {
    const withoutColumn = parseTrajectoryCsv(toCsv())
    expect(withoutColumn.frames[0]?.balls[0]).not.toHaveProperty('confidence')

    const input = fixture()
    input.frames[0]!.balls[0]!.confidence = 0.82
    const withConfidence = parseTrajectoryCsv(toCsv(input))
    expect(withConfidence.frames[0]?.balls[0]?.confidence).toBe(0.82)

    const withoutConfidenceColumn = parseTrajectoryCsv(toCsv(input, false))
    expect(withoutConfidenceColumn.frames[0]?.balls[0]).not.toHaveProperty('confidence')
  })

  it('accepts column order changes without changing the parsed record', () => {
    const csv = toCsv()
    const reordered = csv.split('\n').map((line) => line.split(',').reverse().join(',')).join('\n')
    const parsed = parseTrajectoryCsv(reordered)
    expect(parsed.frames.map((frame) => frame.timestamp_ns)).toEqual(
      fixture().frames.map((frame) => frame.timestamp_ns),
    )
  })

  it('rejects an empty file, an unclosed quote, and a row with the wrong number of cells', () => {
    expect(() => parseTrajectoryCsv('')).toThrow('为空')
    expect(() => parseTrajectoryCsv('schema_version,"unterminated')).toThrow('未闭合')
    const csv = toCsv()
    const lines = csv.split('\n')
    lines[1] = lines[1]!.split(',').slice(0, -1).join(',')
    expect(() => parseTrajectoryCsv(lines.join('\n'))).toThrow('列数与表头不一致')
  })

  it('rejects missing, duplicate and unknown columns', () => {
    const csv = toCsv()
    expect(() => parseTrajectoryCsv(csv.replace('source,nominal_fps,', 'nominal_fps,')))
      .toThrow('缺少必需列 source')
    expect(() => parseTrajectoryCsv(csv.replace('source,nominal_fps,', 'source,source,nominal_fps,')))
      .toThrow('重复列 source')
    expect(() => parseTrajectoryCsv(csv.replace('confidence,provenance_kind', 'confidence,extra,provenance_kind')))
      .toThrow('未知列 extra')
  })

  it('rejects inconsistent metadata and timestamps within a frame', () => {
    const csv = toCsv()
    expect(() => parseTrajectoryCsv(updateCell(csv, 1, 'table_id', 'another-table')))
      .toThrow('与前面记录不一致')
    expect(() => parseTrajectoryCsv(updateCell(csv, 1, 'timestamp_ns', '1')))
      .toThrow('与同一 frame_index 的记录不一致')
  })

  it('rejects invalid schema versions, non-finite numbers, out-of-bounds coordinates and duplicate IDs', () => {
    const csv = toCsv()
    expect(() => parseTrajectoryCsv(updateCell(csv, 0, 'schema_version', '0.2.0')))
      .toThrow('schema_version 必须为 0.1.0')
    expect(() => parseTrajectoryCsv(updateCell(csv, 0, 'x_mm', 'NaN')))
      .toThrow('必须是十进制数字')
    expect(() => parseTrajectoryCsv(updateCell(csv, 0, 'x_mm', '636')))
      .toThrow('坐标超出活动台面矩形')
    expect(() => parseTrajectoryCsv(updateCell(csv, 1, 'ball_id', '0')))
      .toThrow('检测 ID 0 重复')
  })

  it('rejects a trajectory whose first recorded frame does not start at index and timestamp zero', () => {
    const csv = updateCell(toCsv(), 0, 'frame_index', '10')
    expect(() => parseTrajectoryCsv(csv)).toThrow('第一帧 frame_index 必须为 0')
  })
})
