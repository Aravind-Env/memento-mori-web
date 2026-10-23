import { describe, expect, it } from 'vitest'

import {
  SCHEMA_VERSION,
  sanitizeChapters,
  sanitizePeople,
  migrateData,
  DEFAULT_SETTINGS,
} from './model'

describe('sanitizeChapters', () => {
  it('keeps well-formed chapters intact', () => {
    const chapters = sanitizeChapters([
      { id: 'a', profileId: 'p1', name: 'School', startWeek: 0, endWeek: 51, color: 'teal' },
    ])
    expect(chapters).toHaveLength(1)
    expect(chapters[0]).toEqual({
      id: 'a',
      profileId: 'p1',
      name: 'School',
      startWeek: 0,
      endWeek: 51,
      color: 'teal',
    })
  })

  it('drops broken rows and repairs recoverable ones', () => {
    const chapters = sanitizeChapters([
      null,
      'nope',
      { name: 'no id', startWeek: 0, endWeek: 5 },
      { id: 'b', name: 'inverted', startWeek: 9, endWeek: 4 },
      { id: 'c', name: 'neg start', startWeek: -3, endWeek: 4 },
      { id: 'd', name: 'raw numbers', startWeek: '10', endWeek: '20', color: 7 },
      { id: 'e', name: 'ok', startWeek: 10.4, endWeek: 20.6 },
    ])
    expect(chapters).toEqual([
      { id: 'd', profileId: '', name: 'raw numbers', startWeek: 10, endWeek: 20, color: 'teal' },
      { id: 'e', profileId: '', name: 'ok', startWeek: 10, endWeek: 21, color: 'teal' },
    ])
  })

  it('returns an empty array for non-arrays', () => {
    expect(sanitizeChapters(undefined)).toEqual([])
    expect(sanitizeChapters({})).toEqual([])
  })
})

describe('sanitizePeople', () => {
  it('keeps well-formed people and their optional birth date', () => {
    const people = sanitizePeople([
      { id: 'a', profileId: 'p1', name: 'Mum', kind: 'parent', visitsPerYear: 4, dob: '1958-07-01' },
    ])
    expect(people).toEqual([
      { id: 'a', profileId: 'p1', name: 'Mum', kind: 'parent', visitsPerYear: 4, dob: '1958-07-01' },
    ])
  })

  it('drops broken rows, clamps visits and drops nonsense dates', () => {
    const people = sanitizePeople([
      null,
      'nope',
      { name: 'no id', visitsPerYear: 2 },
      { id: 'b', name: 'no visits' },
      { id: 'c', name: 'float visits', visitsPerYear: 3.6 },
      { id: 'd', name: 'big visits', visitsPerYear: 9999 },
      { id: 'e', name: 'bad dob', visitsPerYear: 1, dob: 'not-a-date' },
      { id: 'f', name: 'no kind', visitsPerYear: 1 },
    ])
    expect(people).toEqual([
      { id: 'c', profileId: '', name: 'float visits', kind: 'other', visitsPerYear: 4 },
      { id: 'd', profileId: '', name: 'big visits', kind: 'other', visitsPerYear: 366 },
      { id: 'e', profileId: '', name: 'bad dob', kind: 'other', visitsPerYear: 1 },
      { id: 'f', profileId: '', name: 'no kind', kind: 'other', visitsPerYear: 1 },
    ])
  })

  it('returns an empty array for non-arrays', () => {
    expect(sanitizePeople(undefined)).toEqual([])
    expect(sanitizePeople({})).toEqual([])
  })
})

describe('migrateData', () => {
  const v1Save = {
    profile: { id: 'p1', name: 'A', dob: '1990-01-01', lifeYears: 80, leapRule: 'mar1', createdAt: '' },
    notes: [{ id: 'n1', profileId: 'p1', weekIndex: 5, text: 'hi', tags: [], pinned: false, createdAt: '', updatedAt: '' }],
    settings: { theme: 'dark' },
  }

  it('loads a v1 save with no chapters', () => {
    const data = migrateData(v1Save, 1)
    expect(data.profile?.id).toBe('p1')
    expect(data.notes).toHaveLength(1)
    expect(data.chapters).toEqual([])
    expect(data.settings).toEqual({ ...DEFAULT_SETTINGS, theme: 'dark' })
  })

  it('sanitizes chapters on newer saves and passes unknown fields through', () => {
    const raw = {
      ...v1Save,
      chapters: [{ id: 'c1', profileId: 'p1', name: 'Career', startWeek: 50, endWeek: 100, color: 'blue' }],
    }
    const data = migrateData(raw, SCHEMA_VERSION)
    expect(data.chapters).toHaveLength(1)
  })

  it('tolerates missing fields on v1 saves', () => {
    const data = migrateData({}, 1)
    expect(data.profile).toBeNull()
    expect(data.notes).toEqual([])
    expect(data.chapters).toEqual([])
    expect(data.settings).toEqual(DEFAULT_SETTINGS)
  })

  it('keeps valid review reminder fields and drops corrupt ones', () => {
    const raw = {
      ...v1Save,
      chapters: [],
      settings: { ...DEFAULT_SETTINGS, reminderDay: 1, reviewLastWeek: 5 },
    }
    expect(migrateData(raw, SCHEMA_VERSION).settings).toEqual({
      ...DEFAULT_SETTINGS,
      reminderDay: 1,
      reviewLastWeek: 5,
    })
    const corrupt = {
      ...raw,
      settings: { ...DEFAULT_SETTINGS, reminderDay: 9, reviewLastWeek: -2 },
    }
    expect(migrateData(corrupt, SCHEMA_VERSION).settings).toEqual(DEFAULT_SETTINGS)
  })
})
