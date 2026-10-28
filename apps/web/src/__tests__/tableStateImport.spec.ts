import { describe, expect, it } from 'vitest'

import { createInitialTableState } from '../data/initialTableState'
import { parseTableStateJson } from '../utils/tableStateImport'

function fixture(): Record<string, unknown> {
  return JSON.parse(JSON.stringify(createInitialTableState())) as Record<string, unknown>
}
function parse(value: unknown) {
  return parseTableStateJson(JSON.stringify(value))
}

describe('standard table-state JSON import', () => {
  it('imports the committed fixture without changing high-precision values', () => {
    const original = createInitialTableState()
    const parsed = parse(original)
    expect(parsed).toEqual(original)
    expect(parsed).not.toBe(original)
    expect(parsed.balls[0]).not.toBe(original.balls[0])
  })

  it('accepts a partial frame with confidence endpoints and sorts stable IDs', () => {
    const input = fixture()
    input.balls = [
      { id: 15, x_mm: 635, y_mm: -1270, confidence: 0 },
      { id: 0, x_mm: -635, y_mm: 1270, confidence: 1 },
    ]
    const parsed = parse(input)
    expect(parsed.balls.map((ball) => ball.id)).toEqual([0, 15])
    expect(parsed.balls[1]?.confidence).toBe(0)
  })

  it.each([
    ['invalid JSON', '{'],
    ['non-object', '[]'],
    ['nonfinite large exponent', JSON.stringify(fixture()).replace(
      /"x_mm":-104\.72715759277344/, '"x_mm":1e999',
    )],
  ])('rejects %s', (_, value) => {
    expect(() => parseTableStateJson(value)).toThrow(Error)
  })

  it.each([
    ['missing required', (v: Record<string, unknown>) => { delete v.table_id }],
    ['unknown top-level', (v: Record<string, unknown>) => { v.is_approved = true }],
    ['unsupported version', (v: Record<string, unknown>) => { v.schema_version = '0.2.0' }],
    ['bad version', (v: Record<string, unknown>) => { v.state_version = 0 }],
    ['overflow version', (v: Record<string, unknown>) => { v.state_version = Number.MAX_SAFE_INTEGER }],
    ['missing frame value', (v: Record<string, unknown>) => {
      delete (v.coordinate_frame as Record<string, unknown>).units
    }],
    ['wrong axis', (v: Record<string, unknown>) => {
      (v.coordinate_frame as Record<string, unknown>).x_axis = 'table_length'
    }],
    ['unknown frame value', (v: Record<string, unknown>) => {
      (v.coordinate_frame as Record<string, unknown>).extra = 'bad'
    }],
    ['invalid width', (v: Record<string, unknown>) => {
      (v.table_geometry as Record<string, unknown>).active_width_mm = 0
    }],
    ['missing geometry', (v: Record<string, unknown>) => { delete v.table_geometry }],
    ['no balls', (v: Record<string, unknown>) => { v.balls = [] }],
    ['more than 16', (v: Record<string, unknown>) => {
      const b = v.balls as Record<string, unknown>[]
      v.balls = [...b, { id: 0, x_mm: 0, y_mm: 0 }]
    }],
    ['duplicate IDs', (v: Record<string, unknown>) => {
      (v.balls as Record<string, unknown>[])[1]!.id = 0
    }],
    ['negative ID', (v: Record<string, unknown>) => {
      (v.balls as Record<string, unknown>[])[0]!.id = -1
    }],
    ['fractional ID', (v: Record<string, unknown>) => {
      (v.balls as Record<string, unknown>[])[0]!.id = 1.5
    }],
    ['unknown ball field', (v: Record<string, unknown>) => {
      (v.balls as Record<string, unknown>[])[0]!.ball_number = 0
    }],
    ['out of bounds X', (v: Record<string, unknown>) => {
      (v.balls as Record<string, unknown>[])[0]!.x_mm = 636
    }],
    ['out of bounds Y', (v: Record<string, unknown>) => {
      (v.balls as Record<string, unknown>[])[0]!.y_mm = -1271
    }],
    ['confidence above 1', (v: Record<string, unknown>) => {
      (v.balls as Record<string, unknown>[])[0]!.confidence = 1.1
    }],
    ['null confidence', (v: Record<string, unknown>) => {
      (v.balls as Record<string, unknown>[])[0]!.confidence = null
    }],
    ['null coordinate', (v: Record<string, unknown>) => {
      (v.balls as Record<string, unknown>[])[0]!.x_mm = null
    }],
    ['numeric string', (v: Record<string, unknown>) => {
      (v.balls as Record<string, unknown>[])[0]!.y_mm = '10'
    }],
  ])('rejects %s', (_name, mutate) => {
    const input = fixture()
    mutate(input)
    expect(() => parse(input)).toThrow(Error)
  })

  it('never mutates the parsed input or invents a ball identity', () => {
    const input = fixture()
    input.balls = [{ id: 7, x_mm: 0, y_mm: 0 }]
    const copy = JSON.stringify(input)
    const state = parse(input)
    expect(JSON.stringify(input)).toBe(copy)
    expect(state.balls).toEqual([{ id: 7, x_mm: 0, y_mm: 0 }])
  })
})
