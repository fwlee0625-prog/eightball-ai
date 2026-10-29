import schema from '../../../../packages/contracts/schemas/trajectory.schema.json'

import type {
  TrajectoryBallState,
  TrajectoryFrame,
  TrajectoryRecord,
} from '@/types/trajectory'
import type { TableState } from '@/types/tableState'

type UnknownRecord = Record<string, unknown>

const hasOwn = (value: UnknownRecord, key: string) =>
  Object.prototype.hasOwnProperty.call(value, key)

function recordWithFields(
  value: unknown,
  name: string,
  required: readonly string[],
  allowed: readonly string[],
): UnknownRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${name} 必须是对象。`)
  }
  const record = value as UnknownRecord
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

function safeInteger(value: unknown, name: string, minimum: number): number {
  const number = finiteNumber(value, name)
  if (!Number.isSafeInteger(number) || number < minimum) {
    throw new Error(`${name} 必须是大于等于 ${minimum} 的安全整数。`)
  }
  return number
}

function literal(value: unknown, expected: string, name: string): void {
  if (value !== expected) throw new Error(`${name} 必须为 ${expected}。`)
}

function validateCoordinateFrame(value: unknown): TableState['coordinate_frame'] {
  const frameSchema = schema.properties.coordinate_frame
  const frame = recordWithFields(
    value,
    'coordinate_frame',
    frameSchema.required,
    Object.keys(frameSchema.properties),
  )
  for (const [key, rule] of Object.entries(frameSchema.properties)) {
    literal(frame[key], rule.const, `coordinate_frame.${key}`)
  }
  return {
    units: 'mm',
    origin: 'table_center',
    x_axis: 'table_width',
    y_axis: 'table_length',
    positive_x: 'inherited_from_vision',
    positive_y: 'inherited_from_vision',
    orientation_status: 'provisional',
  }
}

function validateGeometry(value: unknown): TableState['table_geometry'] {
  const geometrySchema = schema.properties.table_geometry
  const geometry = recordWithFields(
    value,
    'table_geometry',
    geometrySchema.required,
    Object.keys(geometrySchema.properties),
  )
  const activeLength = finiteNumber(geometry.active_length_mm, 'active_length_mm')
  const activeWidth = finiteNumber(geometry.active_width_mm, 'active_width_mm')
  if (activeLength <= 0 || activeWidth <= 0) {
    throw new Error('活动台面长宽必须大于零。')
  }
  return { active_length_mm: activeLength, active_width_mm: activeWidth }
}

/**
 * Validate a trajectory v0.1.0 record without inventing missing detections or
 * treating nominal FPS as a substitute for recorded timestamps.
 */
export function parseTrajectoryJson(json: string): TrajectoryRecord {
  let unknownTrajectory: unknown
  try {
    unknownTrajectory = JSON.parse(json)
  } catch {
    throw new Error('文件不是有效的 JSON。')
  }

  const record = recordWithFields(
    unknownTrajectory,
    '轨迹记录',
    schema.required,
    Object.keys(schema.properties),
  )
  literal(record.schema_version, schema.properties.schema_version.const, 'schema_version')

  const trajectoryId = nonEmptyString(record.trajectory_id, 'trajectory_id')
  const matchId = nonEmptyString(record.match_id, 'match_id')
  const rackId = nonEmptyString(record.rack_id, 'rack_id')
  const shotId = nonEmptyString(record.shot_id, 'shot_id')
  const tableId = nonEmptyString(record.table_id, 'table_id')
  const source = nonEmptyString(record.source, 'source')
  const stateVersion = safeInteger(record.state_version, 'state_version', 1)

  const timebaseSchema = schema.properties.timebase
  const timebase = recordWithFields(
    record.timebase,
    'timebase',
    timebaseSchema.required,
    Object.keys(timebaseSchema.properties),
  )
  literal(timebase.timestamp_unit, timebaseSchema.properties.timestamp_unit.const, 'timebase.timestamp_unit')
  literal(timebase.timestamp_origin, timebaseSchema.properties.timestamp_origin.const, 'timebase.timestamp_origin')
  const nominalFps = finiteNumber(timebase.nominal_fps, 'timebase.nominal_fps')
  if (nominalFps <= 0 || nominalFps > 1000) {
    throw new Error('timebase.nominal_fps 必须大于零且不超过 1000。')
  }

  const coordinateFrame = validateCoordinateFrame(record.coordinate_frame)
  const geometry = validateGeometry(record.table_geometry)
  const framesSchema = schema.properties.frames
  if (!Array.isArray(record.frames) ||
    record.frames.length < framesSchema.minItems ||
    record.frames.length > framesSchema.maxItems) {
    throw new Error('frames 必须包含 2 至 10000 帧。')
  }

  const frames: TrajectoryFrame[] = []
  let previousFrameIndex = -1
  let previousTimestamp = -1
  const frameSchema = framesSchema.items
  const ballsSchema = frameSchema.properties.balls
  const ballSchema = ballsSchema.items

  for (let framePosition = 0; framePosition < record.frames.length; framePosition += 1) {
    const frameName = `frames[${framePosition}]`
    const rawFrame = recordWithFields(
      record.frames[framePosition],
      frameName,
      frameSchema.required,
      Object.keys(frameSchema.properties),
    )
    const frameIndex = safeInteger(rawFrame.frame_index, `${frameName}.frame_index`, 0)
    const timestamp = safeInteger(rawFrame.timestamp_ns, `${frameName}.timestamp_ns`, 0)
    if (framePosition === 0 && frameIndex !== 0) {
      throw new Error('第一帧 frame_index 必须为 0。')
    }
    if (framePosition === 0 && timestamp !== 0) {
      throw new Error('第一帧 timestamp_ns 必须为 0（击球开始）。')
    }
    if (frameIndex <= previousFrameIndex) {
      throw new Error('frame_index 必须严格递增；缺帧可通过索引间隔表示。')
    }
    if (timestamp <= previousTimestamp) {
      throw new Error('timestamp_ns 必须严格递增，不能用 nominal_fps 推算时间。')
    }

    if (!Array.isArray(rawFrame.balls) ||
      rawFrame.balls.length < ballsSchema.minItems ||
      rawFrame.balls.length > ballsSchema.maxItems) {
      throw new Error(`${frameName}.balls 必须包含 1 至 16 个检测目标。`)
    }
    const seenIds = new Set<number>()
    const balls: TrajectoryBallState[] = rawFrame.balls.map((rawBall: unknown, ballPosition: number) => {
      const ballName = `${frameName}.balls[${ballPosition}]`
      const ball = recordWithFields(
        rawBall,
        ballName,
        ballSchema.required,
        Object.keys(ballSchema.properties),
      )
      const id = safeInteger(ball.id, `${ballName}.id`, 0)
      if (id > 15) throw new Error(`${ballName}.id 必须在 0 至 15 之间。`)
      if (seenIds.has(id)) throw new Error(`${frameName} 中检测 ID ${id} 重复。`)
      seenIds.add(id)

      const x = finiteNumber(ball.x_mm, `${ballName}.x_mm`)
      const y = finiteNumber(ball.y_mm, `${ballName}.y_mm`)
      if (x < -geometry.active_width_mm / 2 || x > geometry.active_width_mm / 2 ||
        y < -geometry.active_length_mm / 2 || y > geometry.active_length_mm / 2) {
        throw new Error(`${ballName} 的坐标超出活动台面矩形。`)
      }
      const normalizedBall: TrajectoryBallState = { id, x_mm: x, y_mm: y }
      if (hasOwn(ball, 'confidence')) {
        const confidence = finiteNumber(ball.confidence, `${ballName}.confidence`)
        if (confidence < 0 || confidence > 1) {
          throw new Error(`${ballName}.confidence 必须在 0 至 1 之间。`)
        }
        normalizedBall.confidence = confidence
      }
      return normalizedBall
    })

    frames.push({ frame_index: frameIndex, timestamp_ns: timestamp, balls })
    previousFrameIndex = frameIndex
    previousTimestamp = timestamp
  }

  const provenanceSchema = schema.properties.provenance
  const provenance = recordWithFields(
    record.provenance,
    'provenance',
    provenanceSchema.required,
    Object.keys(provenanceSchema.properties),
  )
  if (provenance.kind !== 'synthetic' && provenance.kind !== 'project-provided') {
    throw new Error('provenance.kind 必须为 synthetic 或 project-provided。')
  }
  const provenanceDescription = nonEmptyString(provenance.description, 'provenance.description')

  return {
    schema_version: '0.1.0',
    trajectory_id: trajectoryId,
    match_id: matchId,
    rack_id: rackId,
    shot_id: shotId,
    table_id: tableId,
    state_version: stateVersion,
    source,
    timebase: {
      timestamp_unit: 'ns',
      timestamp_origin: 'shot_start',
      nominal_fps: nominalFps,
    },
    coordinate_frame: coordinateFrame,
    table_geometry: geometry,
    frames,
    provenance: {
      kind: provenance.kind,
      description: provenanceDescription,
    },
  }
}
