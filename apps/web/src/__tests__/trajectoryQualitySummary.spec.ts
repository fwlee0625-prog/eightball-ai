import { describe, expect, it } from 'vitest'

import trajectoryFixture from '../../../../data/samples/trajectory-001.json'
import { parseTrajectoryJson } from '../utils/trajectoryImport'
import { summarizeTrajectoryQuality } from '../utils/trajectoryQualitySummary'

function createRecord() {
  return parseTrajectoryJson(JSON.stringify(trajectoryFixture))
}

describe('summarizeTrajectoryQuality', () => {
  it('summarizes the fixed synthetic sample without treating index gaps as confirmed dropped frames', () => {
    const report = summarizeTrajectoryQuality(createRecord())
    expect(report).toMatchObject({
      frameCount: 6,
      durationNs: 1_750_000_000,
      observedDetectionCount: 96,
      observedDetectionIds: Array.from({ length: 16 }, (_, id) => id),
      sourceIndexGapIntervals: 5,
      unrecordedSourceIndexes: 345,
      missingObservationCount: 0,
      framesWithMissingObservations: 0,
      confidenceObservationCount: 0,
      lowConfidenceObservationCount: 0,
      nominalTimingOutlierIntervals: 0,
      overlapCheck: 'skipped-unmeasured-diameter',
    })
  })

  it('reports missing detections separately from low-confidence observations', () => {
    const record = createRecord()
    record.frames[1]!.balls.pop()
    record.frames[2]!.balls[0]!.confidence = 0.2
    const report = summarizeTrajectoryQuality(record)
    expect(report.missingObservationCount).toBe(1)
    expect(report.framesWithMissingObservations).toBe(1)
    expect(report.confidenceObservationCount).toBe(1)
    expect(report.lowConfidenceObservationCount).toBe(1)
  })

  it('flags nominal timing deviations but preserves source timestamps', () => {
    const record = createRecord()
    record.frames[1]!.timestamp_ns = 400_000_000
    const before = record.frames.map((frame) => frame.timestamp_ns)
    const report = summarizeTrajectoryQuality(record)
    expect(report.nominalTimingOutlierIntervals).toBe(2)
    expect(record.frames.map((frame) => frame.timestamp_ns)).toEqual(before)
  })

  it('does not infer overlap without a measured physical diameter', () => {
    const record = createRecord()
    record.frames[0]!.balls[1]!.x_mm = record.frames[0]!.balls[0]!.x_mm
    record.frames[0]!.balls[1]!.y_mm = record.frames[0]!.balls[0]!.y_mm
    expect(summarizeTrajectoryQuality(record).overlapCheck).toBe('skipped-unmeasured-diameter')
  })

  it('is deterministic and does not mutate the trajectory', () => {
    const record = createRecord()
    const original = structuredClone(record)
    const first = summarizeTrajectoryQuality(record)
    expect(summarizeTrajectoryQuality(record)).toEqual(first)
    expect(record).toEqual(original)
  })
})
