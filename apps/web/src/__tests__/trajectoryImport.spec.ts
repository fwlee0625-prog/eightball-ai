import { describe, expect, it } from 'vitest'

import trajectoryFixture from '../../../../data/samples/trajectory-001.json'
import { parseTrajectoryJson } from '../utils/trajectoryImport'
import type { TrajectoryRecord } from '../types/trajectory'

function fixture(): TrajectoryRecord {
  return JSON.parse(JSON.stringify(trajectoryFixture)) as TrajectoryRecord
}

function parse(value: unknown): TrajectoryRecord {
  return parseTrajectoryJson(JSON.stringify(value))
}

describe('trajectory JSON import', () => {
  it('rejects invalid JSON text', () => {
    expect(() => parseTrajectoryJson('{')).toThrow('有效的 JSON')
  })

  it('parses the synthetic sample and preserves recorded timestamps and frame gaps', () => {
    const parsed = parse(fixture())
    expect(parsed.frames).toHaveLength(6)
    expect(parsed.frames.map((frame) => frame.frame_index)).toEqual([0, 1, 2, 4, 5, 7])
    expect(parsed.frames.map((frame) => frame.timestamp_ns)).toEqual([
      0, 5_000_000, 10_000_000, 20_000_000, 25_000_000, 35_000_000,
    ])
    expect(parsed.frames[0]?.balls).toHaveLength(16)
    expect(parsed.provenance.kind).toBe('synthetic')
  })

  it('does not mutate the input or infer a canonical ball identity', () => {
    const input = fixture()
    const before = JSON.stringify(input)
    const parsed = parse(input)
    expect(JSON.stringify(input)).toBe(before)
    expect(parsed.frames[0]?.balls.find((ball) => ball.id === 7)).toEqual(
      expect.objectContaining({ id: 7 }),
    )
    expect(parsed.frames[0]?.balls.find((ball) => ball.id === 7)).not.toHaveProperty('ball_number')
  })

  it.each([
    ['unsupported version', { ...fixture(), schema_version: '0.2.0' }],
    ['unknown top-level field', { ...fixture(), approved: true }],
    ['empty shot ID', { ...fixture(), shot_id: '  ' }],
    ['unsafe state version', { ...fixture(), state_version: Number.MAX_SAFE_INTEGER + 1 }],
    ['nonpositive nominal FPS', { ...fixture(), timebase: { ...fixture().timebase, nominal_fps: 0 } }],
    ['wrong timestamp unit', { ...fixture(), timebase: { ...fixture().timebase, timestamp_unit: 'ms' } }],
    ['wrong coordinate axis', {
      ...fixture(),
      coordinate_frame: { ...fixture().coordinate_frame, x_axis: 'table_length' },
    }],
    ['nonpositive table width', {
      ...fixture(),
      table_geometry: { ...fixture().table_geometry, active_width_mm: 0 },
    }],
    ['fewer than two frames', { ...fixture(), frames: [fixture().frames[0]] }],
    ['first frame starts after zero', {
      ...fixture(),
      frames: fixture().frames.map((frame, index) => index === 0
        ? { ...frame, timestamp_ns: 1 }
        : frame),
    }],
    ['non-increasing timestamp', {
      ...fixture(),
      frames: fixture().frames.map((frame, index) => index === 1
        ? { ...frame, timestamp_ns: 0 }
        : frame),
    }],
    ['non-increasing frame index', {
      ...fixture(),
      frames: fixture().frames.map((frame, index) => index === 1
        ? { ...frame, frame_index: 0 }
        : frame),
    }],
    ['duplicate detection ID in a frame', {
      ...fixture(),
      frames: fixture().frames.map((frame, index) => index === 0
        ? { ...frame, balls: [...frame.balls, { id: 0, x_mm: 0, y_mm: 0 }] }
        : frame),
    }],
    ['out-of-bounds coordinate', {
      ...fixture(),
      frames: fixture().frames.map((frame, index) => index === 0
        ? { ...frame, balls: frame.balls.map((ball, ballIndex) => ballIndex === 0
          ? { ...ball, x_mm: 636 }
          : ball) }
        : frame),
    }],
    ['unknown ball field', {
      ...fixture(),
      frames: fixture().frames.map((frame, index) => index === 0
        ? { ...frame, balls: frame.balls.map((ball, ballIndex) => ballIndex === 0
          ? { ...ball, ball_number: 8 }
          : ball) }
        : frame),
    }],
    ['bad confidence', {
      ...fixture(),
      frames: fixture().frames.map((frame, index) => index === 0
        ? { ...frame, balls: frame.balls.map((ball, ballIndex) => ballIndex === 0
          ? { ...ball, confidence: 1.1 }
          : ball) }
        : frame),
    }],
    ['unknown provenance kind', {
      ...fixture(),
      provenance: { ...fixture().provenance, kind: 'unknown' },
    }],
  ])('rejects %s', (_name, value) => {
    expect(() => parse(value)).toThrow(Error)
  })
})
