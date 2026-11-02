import { describe, expect, it } from 'vitest'

import { nextStateVersion } from '../utils/stateVersion'

describe('state version increments', () => {
  it.each([[1, 2], [42, 43], [Number.MAX_SAFE_INTEGER - 1, Number.MAX_SAFE_INTEGER]])(
    'increments the safe version %s to %s',
    (current, expected) => {
      expect(nextStateVersion(current)).toBe(expected)
    },
  )

  it.each([
    0,
    -1,
    1.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.MAX_SAFE_INTEGER,
    Number.MAX_SAFE_INTEGER + 1,
  ])('rejects unsafe current version %s', (current) => {
    expect(() => nextStateVersion(current)).toThrow(Error)
  })
})
