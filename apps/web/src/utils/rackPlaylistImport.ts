import type { TrajectoryRecord } from '@/types/trajectory'
import { parseTrajectoryJson } from '@/utils/trajectoryImport'

export interface RackPlaylist {
  schema_version: '0.1.0'
  match_id: string
  rack_id: string
  table_id: string
  sequence_origin: 'manual'
  shots: TrajectoryRecord[]
}

/** Parse an explicitly ordered rack bundle, not inferred strike events. */
export function parseRackPlaylistJson(text: string): RackPlaylist {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    throw new Error('多杆文件不是有效的 JSON。')
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('多杆文件必须是对象。')
  }
  const raw = value as Record<string, unknown>
  const fields = ['schema_version', 'match_id', 'rack_id', 'table_id', 'sequence_origin', 'shots']
  if (Object.keys(raw).length !== fields.length || fields.some((key) => !Object.hasOwn(raw, key))) {
    throw new Error('多杆文件字段不符合契约。')
  }
  if (raw.schema_version !== '0.1.0' || raw.sequence_origin !== 'manual') {
    throw new Error('多杆文件版本或顺序来源不符合契约。')
  }
  for (const key of ['match_id', 'rack_id', 'table_id']) {
    if (typeof raw[key] !== 'string' || !raw[key].trim()) {
      throw new Error(key + ' 必须为非空字符串。')
    }
  }
  if (!Array.isArray(raw.shots) || raw.shots.length < 2 || raw.shots.length > 100) {
    throw new Error('多杆文件必须包含 2 至 100 杆。')
  }

  const shots = raw.shots.map((shot: unknown) => parseTrajectoryJson(JSON.stringify(shot)))
  const first = shots[0]!
  const ids = new Set<string>()
  const trajectoryIds = new Set<string>()
  let previousStateVersion = 0
  for (const shot of shots) {
    if (shot.match_id !== raw.match_id || shot.rack_id !== raw.rack_id || shot.table_id !== raw.table_id) {
      throw new Error('多杆文件的球局标识不一致。')
    }
    if (ids.has(shot.shot_id) || trajectoryIds.has(shot.trajectory_id)) {
      throw new Error('多杆文件包含重复 shot_id 或 trajectory_id。')
    }
    ids.add(shot.shot_id)
    trajectoryIds.add(shot.trajectory_id)
    if (shot.state_version <= previousStateVersion) {
      throw new Error('多杆文件的 state_version 必须按显式顺序严格递增。')
    }
    previousStateVersion = shot.state_version
    if (JSON.stringify(shot.coordinate_frame) !== JSON.stringify(first.coordinate_frame) ||
      shot.table_geometry.active_length_mm !== first.table_geometry.active_length_mm ||
      shot.table_geometry.active_width_mm !== first.table_geometry.active_width_mm) {
      throw new Error('多杆文件的坐标系或活动台面尺寸不一致。')
    }
  }

  return {
    schema_version: '0.1.0',
    match_id: raw.match_id as string,
    rack_id: raw.rack_id as string,
    table_id: raw.table_id as string,
    sequence_origin: 'manual',
    shots,
  }
}
