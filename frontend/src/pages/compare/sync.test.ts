import { syncStep, type SyncSnapshot } from './sync'

const snap = (url: number[], store: number[]): SyncSnapshot => ({ url, store })

describe('syncStep (URL <-> store reconciliation)', () => {
  it('seeds the store from the URL on first load when the URL carries ids', () => {
    expect(syncStep(null, snap([1, 2, 3], [9]))).toEqual({ kind: 'set-store', ids: [1, 2, 3] })
  })
  it('writes the persisted store to the URL on first load when the URL is empty', () => {
    expect(syncStep(null, snap([], [4, 5]))).toEqual({ kind: 'set-url', ids: [4, 5] })
  })
  it('does nothing when both are empty or already agree', () => {
    expect(syncStep(null, snap([], []))).toEqual({ kind: 'none' })
    expect(syncStep(snap([1, 2], [1, 2]), snap([1, 2], [1, 2]))).toEqual({ kind: 'none' })
  })
  it('lets a URL edit win over the store after load', () => {
    expect(syncStep(snap([1, 2], [1, 2]), snap([7, 8], [1, 2]))).toEqual({ kind: 'set-store', ids: [7, 8] })
  })
  it('pushes store changes (add/remove/clear) back to the URL', () => {
    expect(syncStep(snap([1, 2], [1, 2]), snap([1, 2], [1, 2, 3]))).toEqual({ kind: 'set-url', ids: [1, 2, 3] })
    expect(syncStep(snap([1, 2], [1, 2]), snap([1, 2], []))).toEqual({ kind: 'set-url', ids: [] })
  })
  it('caps the comparison at six players and drops duplicates', () => {
    expect(syncStep(null, snap([1, 1, 2, 3, 4, 5, 6, 7], []))).toEqual({ kind: 'set-store', ids: [1, 2, 3, 4, 5, 6] })
  })
})
