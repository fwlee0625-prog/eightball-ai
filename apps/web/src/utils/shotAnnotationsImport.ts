import type { RackPlaylist } from '@/utils/rackPlaylistImport'

export interface ShotAnnotation {
  shot_id: string
  expert_text: string
  text_source: 'provided-transcript'
  relative_timestamp_ns: number | null
  actual_observation: { raw_text: string; source: 'manual-note' } | null
}
export interface ShotAnnotations {
  schema_version: '0.1.0'
  match_id: string
  rack_id: string
  annotations: ShotAnnotation[]
}

function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('讲解文本数据必须是对象。')
  }
  return value as Record<string, unknown>
}

function exactFields(value: Record<string, unknown>, fields: string[]) {
  if (Object.keys(value).length !== fields.length || fields.some((key) => !Object.prototype.hasOwnProperty.call(value, key))) {
    throw new Error('讲解文本字段不符合契约。')
  }
}

function nonEmpty(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(name + ' 必须为非空文本。')
  return value
}

export function parseShotAnnotationsJson(text: string): ShotAnnotations {
  let input: unknown
  try {
    input = JSON.parse(text)
  } catch {
    throw new Error('讲解文本文件不是有效的 JSON。')
  }
  const value = record(input)
  exactFields(value, ['schema_version', 'match_id', 'rack_id', 'annotations'])
  if (value.schema_version !== '0.1.0') throw new Error('讲解文本版本不支持。')
  const matchId = nonEmpty(value.match_id, 'match_id')
  const rackId = nonEmpty(value.rack_id, 'rack_id')
  if (!Array.isArray(value.annotations) || value.annotations.length < 1 || value.annotations.length > 100) {
    throw new Error('讲解文本必须包含 1 至 100 条关联。')
  }
  const seen = new Set<string>()
  const annotations = value.annotations.map((raw: unknown): ShotAnnotation => {
    const note = record(raw)
    exactFields(note, ['shot_id', 'expert_text', 'text_source', 'relative_timestamp_ns', 'actual_observation'])
    const shotId = nonEmpty(note.shot_id, 'shot_id')
    if (seen.has(shotId)) throw new Error('重复关联 shot_id。')
    seen.add(shotId)
    const expertText = nonEmpty(note.expert_text, 'expert_text')
    if (note.text_source !== 'provided-transcript') throw new Error('仅支持已提供的讲解文本。')
    const time = note.relative_timestamp_ns
    if (time !== null && (!Number.isSafeInteger(time) || typeof time !== 'number' || time < 0)) {
      throw new Error('relative_timestamp_ns 无效。')
    }
    let outcome: ShotAnnotation['actual_observation'] = null
    if (note.actual_observation !== null) {
      const manual = record(note.actual_observation)
      exactFields(manual, ['raw_text', 'source'])
      if (manual.source !== 'manual-note') throw new Error('实际结果只能标记为人工备注。')
      outcome = { raw_text: nonEmpty(manual.raw_text, 'actual_observation.raw_text'), source: 'manual-note' }
    }
    return { shot_id: shotId, expert_text: expertText, text_source: 'provided-transcript',
      relative_timestamp_ns: time as number | null, actual_observation: outcome }
  })
  return { schema_version: '0.1.0', match_id: matchId, rack_id: rackId, annotations }
}

/** Explicit match/rack/shot IDs only; never infer time alignment from free text. */
export function validateAnnotationsForPlaylist(
  notes: ShotAnnotations, playlist: Pick<RackPlaylist, 'match_id' | 'rack_id' | 'shots'>,
): void {
  if (notes.match_id !== playlist.match_id || notes.rack_id !== playlist.rack_id) {
    throw new Error('讲解文本所属球局与轨迹不一致。')
  }
  const shots = new Map(playlist.shots.map((s) => [s.shot_id, s]))
  for (const note of notes.annotations) {
    const shot = shots.get(note.shot_id)
    if (!shot) throw new Error('讲解文本关联了不存在的 shot_id。')
    if (note.relative_timestamp_ns !== null &&
      note.relative_timestamp_ns > shot.frames[shot.frames.length - 1]!.timestamp_ns) {
      throw new Error('讲解文本的相对时间超过了杆次时长。')
    }
  }
}
