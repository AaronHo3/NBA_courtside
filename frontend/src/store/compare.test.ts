import { useCompare, MAX_COMPARE } from './compare'

describe('compare store', () => {
  beforeEach(() => { useCompare.getState().clear(); useCompare.setState({ namespace: null }) })
  it('resets the group when the served namespace changes', () => {
    const s = useCompare.getState()
    s.add({ player_id: 9000001, full_name: 'Demo' })
    s.syncNamespace('demo')
    expect(useCompare.getState().players).toHaveLength(0) // group saved before any namespace was recorded is stale
    useCompare.getState().add({ player_id: 9000002, full_name: 'Demo 2' })
    useCompare.getState().syncNamespace('demo')
    expect(useCompare.getState().players).toHaveLength(1) // same namespace keeps it
    useCompare.getState().syncNamespace('nba')
    expect(useCompare.getState().players).toHaveLength(0)
  })
  it('adds, toggles and caps at six', () => {
    const s = useCompare.getState()
    for (let i = 1; i <= MAX_COMPARE; i++) expect(s.add({ player_id: i, full_name: `P${i}` })).toBe(true)
    expect(s.add({ player_id: 99, full_name: 'Too many' })).toBe(false)
    s.toggle({ player_id: 3, full_name: 'P3' })
    expect(useCompare.getState().players.map((p) => p.player_id)).toEqual([1, 2, 4, 5, 6])
    expect(useCompare.getState().has(3)).toBe(false)
  })
})
