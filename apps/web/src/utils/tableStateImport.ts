import schema from '../../../../packages/contracts/schemas/table-state.schema.json'

import type { TableBallState, TableState } from '@/types/tableState'

const hasOwn = (value: Record<string, unknown>, key: string) =>
  Object.prototype.hasOwnProperty.call(value, key)

function recordWithFields(
  value: unknown,
  name: string,
  required: readonly string[],
  allowed: readonly string[],
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${name} 必须是对象。`)
  }
  const record = value as Record<string, unknown>
  for (const key of required) {
    if (!hasOwn(record, key)) throw new Error(`${name} 缺少 ${key} 字段。`)
  }
  for (const key of Object.keys(record)) {
    if (!allowed.includes(key)) throw new Error(`${name} 包含未知字段 ${key}。`)
  }
  return record
}

function nonEmptyString(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${name} 必须是非空字符串。`)
  }
  return value
}

function finiteNumber(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${name} 必须是有限数字。`)
  }
  return value
}

function literal(value: unknown, expected: string, name: string): void {
  if (value !== expected) throw new Error(`${name} 必须为 ${expected}。`)
}

/**
 * Accept only the committed table-state v0.1.0 contract.
 * JSON Schema fields are checked first; domain invariants missing from the
 * schema (unique IDs, finite values, active-table bounds) are checked here.
 * No network requests, implicit coordinate conversion, or ball-number inference.
 */
export function parseTableStateJson(json: string): TableState {
  let unknownState: unknown
  try {
    unknownState = JSON.parse(json)
  } catch {
    throw new Error('文件不是有效的 JSON。')
  }

  const state = recordWithFields(
    unknownState, '球局状态', schema.required, Object.keys(schema.properties),
  )
  literal(state.schema_version, schema.properties.schema_version.const, 'schema_version')
  const tableId = nonEmptyString(state.table_id, 'table_id')
  const source = nonEmptyString(state.source, 'source')
  const version = finiteNumber(state.state_version, 'state_version')
  if (!Number.isSafeInteger(version) || version < 1 || version >= Number.MAX_SAFE_INTEGER) {
    throw new Error('state_version 必须是可安全递增的正整数。')
  }

  const frameSchema = schema.properties.coordinate_frame
  const frame = recordWithFields(
    state.coordinate_frame, 'coordinate_frame',
    frameSchema.required, Object.keys(frameSchema.properties),
  )
  for (const [key, rule] of Object.entries(frameSchema.properties)) {
    literal(frame[key], rule.const, `coordinate_frame.${key}`)
  }

  const geometrySchema = schema.properties.table_geometry
  const geometry = recordWithFields(
    state.table_geometry, 'table_geometry',
    geometrySchema.required, Object.keys(geometrySchema.properties),
  )
  const width = finiteNumber(geometry.active_width_mm, 'active_width_mm')
  const length = finiteNumber(geometry.active_length_mm, 'active_length_mm')
  if (width <= 0 || length <= 0) throw new Error('活动台面长宽必须大于零。')

  const ballsValue = state.balls
  if (!Array.isArray(ballsValue) ||
    ballsValue.length < schema.properties.balls.minItems ||
    ballsValue.length > schema.properties.balls.maxItems) {
    throw new Error('balls 必须包含 1 至 16 个视觉检测目标。')
  }

  const ballSchema = schema.properties.balls.items
  const seen = new Set<number>()
  const balls: TableBallState[] = ballsValue.map((value: unknown, index: number) => {
    const name = `balls[${index}]`
    const record = recordWithFields(
      value, name, ballSchema.required, Object.keys(ballSchema.properties),
    )
    const id = finiteNumber(record.id, `${name}.id`)
    if (!Number.isInteger(id) || id < 0 || id > 15) {
      throw new Error(`${name}.id 必须是 0 至 15 的整数。`)
    }
    if (seen.has(id)) throw new Error(`视觉检测 ID ${id} 重复。`)
    seen.add(id)

    const x = finiteNumber(record.x_mm, `${name}.x_mm`)
    const y = finiteNumber(record.y_mm, `${name}.y_mm`)
    if (x < -width / 2 || x > width / 2 || y < -length / 2 || y > length / 2) {
      throw new Error(`${name} 的坐标超出活动台面矩形。`)
    }
    const ball: TableBallState = { id, x_mm: x, y_mm: y }
    if (hasOwn(record, 'confidence')) {
      const confidence = finiteNumber(record.confidence, `${name}.confidence`)
      if (confidence < 0 || confidence > 1) {
        throw new Error(`${name}.confidence 必须在 0 至 1 之间。`)
      }
      ball.confidence = confidence
    }
    return ball
  })

  balls.sort((a, b) => a.id - b.id)
  return {
    schema_version: '0.1.0',
    table_id: tableId,
    state_version: version,
    source,
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
      active_length_mm: length,
      active_width_mm: width,
    },
    balls,
  }
}
