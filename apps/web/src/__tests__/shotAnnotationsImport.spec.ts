import { describe, expect, it } from 'vitest'
import rackFixture from '../../../../data/samples/rack-playlist-001.json'
import annotationsFixture from '../../../../data/samples/shot-annotations-001.json'
import { parseRackPlaylistJson } from '../utils/rackPlaylistImport'
import { parseShotAnnotationsJson, validateAnnotationsForPlaylist } from '../utils/shotAnnotationsImport'

describe('existing professional text annotation import', () => {
  it('only links explicitly supplied text and leaves outcomes unknown', () => {
    const notes = parseShotAnnotationsJson(JSON.stringify(annotationsFixture))
    validateAnnotationsForPlaylist(notes, parseRackPlaylistJson(JSON.stringify(rackFixture)))
    expect(notes.annotations).toHaveLength(2)
    expect(notes.annotations[0]?.actual_observation).toBeNull()
  })

  it('rejects unknown shot ids, duplicate entries and false source types', () => {
    const playlist = parseRackPlaylistJson(JSON.stringify(rackFixture))
    const notes = structuredClone(annotationsFixture)
    notes.annotations[0]!.shot_id = 'not-present'
    expect(() => validateAnnotationsForPlaylist(parseShotAnnotationsJson(JSON.stringify(notes)), playlist)).toThrow(/不存在/)
    notes.annotations[0]!.shot_id = notes.annotations[1]!.shot_id
    expect(() => parseShotAnnotationsJson(JSON.stringify(notes))).toThrow(/重复/)
  })

  it('rejects invalid JSON and manual notes pretending automated verification', () => {
    expect(() => parseShotAnnotationsJson('{')).toThrow(/JSON/)
    const raw: unknown = { ...annotationsFixture, annotations: [{
      ...annotationsFixture.annotations[0], actual_observation: { raw_text: 'hit', source: 'model' },
    }] }
    expect(() => parseShotAnnotationsJson(JSON.stringify(raw))).toThrow(/人工备注/)
  })
})
