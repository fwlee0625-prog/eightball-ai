import type { TrajectoryRecord } from '@/types/trajectory'

export interface TrajectoryQualitySummary {
  frameCount: number
  durationNs: number
  observedDetectionCount: number
  observedDetectionIds: number[]
  sourceIndexGapIntervals: number
  unrecordedSourceIndexes: number
  missingObservationCount: number
  framesWithMissingObservations: number
  confidenceObservationCount: number
  lowConfidenceObservationCount: number
  nominalTimingOutlierIntervals: number
  overlapCheck: 'skipped-unmeasured-diameter'
}

const LOW_CONFIDENCE_THRESHOLD = 0.5
const NOMINAL_TIMING_TOLERANCE = 0.25

/**
 * Calculate a compact quality summary locally for the playback UI.
 * This mirrors the Python diagnostic thresholds but does not upload trajectory data.
 * Overlap checks remain disabled until the real ball diameter is physically calibrated.
 */
export function summarizeTrajectoryQuality(
  record: TrajectoryRecord,
): TrajectoryQualitySummary {
  const frames = record.frames
  const observedDetectionIds = [...new Set(
    frames.flatMap((frame) => frame.balls.map((ball) => ball.id)),
  )].sort((left, right) => left - right)
  const allObservedIds = new Set(observedDetectionIds)

  let observedDetectionCount = 0
  let missingObservationCount = 0
  let framesWithMissingObservations = 0
  let confidenceObservationCount = 0
  let lowConfidenceObservationCount = 0
  let sourceIndexGapIntervals = 0
  let unrecordedSourceIndexes = 0
  let nominalTimingOutlierIntervals = 0

  for (const frame of frames) {
    observedDetectionCount += frame.balls.length
    const frameIds = new Set(frame.balls.map((ball) => ball.id))
    let missingInFrame = 0
    for (const id of allObservedIds) {
      if (!frameIds.has(id)) missingInFrame += 1
    }
    missingObservationCount += missingInFrame
    if (missingInFrame > 0) framesWithMissingObservations += 1

    for (const ball of frame.balls) {
      if (ball.confidence === undefined) continue
      confidenceObservationCount += 1
      if (ball.confidence < LOW_CONFIDENCE_THRESHOLD) {
        lowConfidenceObservationCount += 1
      }
    }
  }

  const nominalIntervalNs = 1_000_000_000 / record.timebase.nominal_fps
  for (let index = 1; index < frames.length; index += 1) {
    const previous = frames[index - 1]
    const current = frames[index]
    if (!previous || !current) continue

    const indexDelta = current.frame_index - previous.frame_index
    const gap = indexDelta - 1
    if (gap > 0) {
      sourceIndexGapIntervals += 1
      unrecordedSourceIndexes += gap
    }

    const elapsedNs = current.timestamp_ns - previous.timestamp_ns
    const observedIntervalNs = elapsedNs / indexDelta
    const deviationRatio = Math.abs(observedIntervalNs / nominalIntervalNs - 1)
    if (deviationRatio > NOMINAL_TIMING_TOLERANCE) {
      nominalTimingOutlierIntervals += 1
    }
  }

  return {
    frameCount: frames.length,
    durationNs: frames[frames.length - 1]?.timestamp_ns ?? 0,
    observedDetectionCount,
    observedDetectionIds,
    sourceIndexGapIntervals,
    unrecordedSourceIndexes,
    missingObservationCount,
    framesWithMissingObservations,
    confidenceObservationCount,
    lowConfidenceObservationCount,
    nominalTimingOutlierIntervals,
    overlapCheck: 'skipped-unmeasured-diameter',
  }
}
