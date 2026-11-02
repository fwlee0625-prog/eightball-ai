import type { TableState } from '@/types/tableState'

export interface TrajectoryBallState {
  /** Source tracking ID only; this is not a canonical billiards ball number. */
  id: number
  x_mm: number
  y_mm: number
  confidence?: number
}

export interface TrajectoryFrame {
  /** Original source frame index; gaps are allowed to represent missing frames. */
  frame_index: number
  /** Nanoseconds elapsed since the start of this shot. */
  timestamp_ns: number
  /** Only detections observed in this frame; missing IDs are not inferred. */
  balls: TrajectoryBallState[]
}

export interface TrajectoryRecord {
  schema_version: '0.1.0'
  trajectory_id: string
  match_id: string
  rack_id: string
  shot_id: string
  table_id: string
  state_version: number
  source: string
  timebase: {
    timestamp_unit: 'ns'
    timestamp_origin: 'shot_start'
    nominal_fps: number
  }
  coordinate_frame: TableState['coordinate_frame']
  table_geometry: TableState['table_geometry']
  frames: TrajectoryFrame[]
  provenance: {
    kind: 'synthetic' | 'project-provided'
    description: string
  }
}
