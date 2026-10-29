import { describe, expect, it } from 'vitest'
import sample from '../../../../data/samples/rack-playlist-001.json'
import { parseRackPlaylistJson } from '../utils/rackPlaylistImport'

function variant() {
  return structuredClone(sample)
}

describe('rack playlist import', () => {
  it('parses explicit two-shot order and keeps per-shot timestamps', () => {
    const content = JSON.stringify(sample)
    const result = parseRackPlaylistJson(content)
    expect(result.shots.map((shot) => shot.shot_id)).toEqual(['synthetic-shot-001', 'synthetic-shot-002'])
    expect(result.shots.map((shot) => shot.state_version)).toEqual([1, 2])
    expect(result.shots.map((shot) => shot.frames[0]?.timestamp_ns)).toEqual([0, 0])
    expect(content).toBe(JSON.stringify(sample))
  })

  it('rejects duplicate ids and reversed versions', () => {
    const bad = variant()
    bad.shots[1]!.shot_id = bad.shots[0]!.shot_id
    expect(() => parseRackPlaylistJson(JSON.stringify(bad))).toThrow(/重复/)
    bad.shots[1]!.shot_id = 'synthetic-shot-002'
    bad.shots[1]!.state_version = 1
    expect(() => parseRackPlaylistJson(JSON.stringify(bad))).toThrow(/严格递增/)
  })

  it('rejects inconsistent rack identifiers, missing shots and invalid JSON', () => {
    const bad = variant()
    bad.shots[1]!.rack_id = 'wrong-rack'
    expect(() => parseRackPlaylistJson(JSON.stringify(bad))).toThrow(/标识不一致/)
    expect(() => parseRackPlaylistJson('{"shots":')).toThrow(/有效的 JSON/)
    const oneShot: unknown = { ...sample, shots: [sample.shots[0]] }
    expect(() => parseRackPlaylistJson(JSON.stringify(oneShot))).toThrow(/2 至 100/)
  })
})
