export interface TableBallState {
  /** Source-provided detection/tracking identifier; not a canonical ball number. */
  id: number
  x_mm: number
  y_mm: number
  confidence?: number
}

export interface TableState {
  schema_version: '0.1.0'
  table_id: string
  state_version: number
  source: string
  coordinate_frame: {
    units: 'mm'
    origin: 'table_center'
    x_axis: 'table_width'
    y_axis: 'table_length'
    positive_x: 'inherited_from_vision'
    positive_y: 'inherited_from_vision'
    orientation_status: 'provisional'
  }
  table_geometry: {
    active_length_mm: number
    active_width_mm: number
  }
  balls: TableBallState[]
}

export type SceneStatus = 'loading' | 'ready' | 'fallback' | 'error'
