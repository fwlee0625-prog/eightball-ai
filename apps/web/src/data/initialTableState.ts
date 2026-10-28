import tableStateFixture from '../../../../data/samples/table-state-001.json'
import type { TableState } from '@/types/tableState'

// Keep the repository-level sample as the single coordinate source of truth.
const fixture = tableStateFixture as unknown as TableState

export function createInitialTableState(): TableState {
  return {
    ...fixture,
    coordinate_frame: { ...fixture.coordinate_frame },
    table_geometry: { ...fixture.table_geometry },
    balls: fixture.balls.map((ball) => ({ ...ball })),
  }
}
