import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { ShotEvidencePanel } from './ShotEvidencePanel'

function mockFetch(body: unknown) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } }))
}
function renderPanel() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <ShotEvidencePanel gameId="0022400061" gameEventId={7} onClose={() => {}} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

afterEach(() => vi.restoreAllMocks())

describe('ShotEvidencePanel', () => {
  it('explains when no event is mapped for the shot', async () => {
    mockFetch({ success: true, data: null, error: null, meta: { event_id_map_method: null, confidence: null, reason: 'no event mapped for shot 7 of game 0022400061; ingest events for the game' } })
    renderPanel()
    expect(await screen.findByText(/no play-by-play event is mapped/i)).toBeInTheDocument()
    expect(screen.getByText(/ingest events for the game/)).toBeInTheDocument()
  })
  it('shows the mapped event, participants and the external reference', async () => {
    mockFetch({
      success: true, error: null,
      meta: { event_id_map_method: 'equal_ids', confidence: 'exact', verified_at: '2026-10-09T00:00:00Z' },
      data: {
        event: { game_id: '0022400061', source_event_system: 'pbp_v3', source_event_id: 7, period: 1, clock_ms: 708000, description: "Tatum 27' 3PT Pullup Jump Shot", action_type: 'Made Shot', sub_type: 'Pullup Jump shot', person_id: 1628369, team_id: 1610612738, is_field_goal: true, shot_result: 'Made' },
        participants: [{ role: 'actor', person_id: 1628369, team_id: 1610612738 }],
        evidence: [{ evidence_id: '01J0000000000000000000000A', kind: 'external_reference', evidence_class: 'reference', review_status: 'unreviewed', status: 'active', summary: 'x', player_ids: [1628369],
          reference: { external_url: 'https://www.nba.com/stats/events/?GameID=0022400061&GameEventID=7&flag=1', availability: 'available', availability_checked_at: '2026-10-09T00:00:00Z', metadata: { description: "Tatum 27' 3PT Pullup Jump Shot", duration_ms: 12750 } } }],
      },
    })
    renderPanel()
    expect(await screen.findByText("Tatum 27' 3PT Pullup Jump Shot")).toBeInTheDocument()
    expect(screen.getByText(/Q1 · 11:48/)).toBeInTheDocument()
    expect(screen.getByText(/mapped by equal ids/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /open on nba\.com/i })).toHaveAttribute('href', expect.stringContaining('GameEventID=7'))
    expect(screen.getByRole('link', { name: /game page/i })).toHaveAttribute('href', expect.stringContaining('/games/0022400061'))
  })
})
