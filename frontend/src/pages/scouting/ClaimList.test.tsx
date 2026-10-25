import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ClaimList } from './ClaimList'

const base = { claim_id: '01A', order_index: 0, player_ids: [1], time_scope: {}, numeric_refs: [], limitations: [], counterevidence_ids: [], created_at: 't' }

describe('ClaimList', () => {
  it('renders claims under their validated type with evidence links and dropped ones struck through', () => {
    render(
      <MemoryRouter>
        <ClaimList
          claims={[
            { ...base, claim_id: '01A', claim_text: 'TS% .582', claim_type: 'statistical', original_type: 'statistical', validation_status: 'valid', evidence_ids: [], notes: [] },
            { ...base, claim_id: '01B', claim_text: 'closes out hard', claim_type: 'interpretation', original_type: 'reviewed_observation', validation_status: 'downgraded', evidence_ids: ['01EVIDENCE00000000000000000'], notes: ['no reviewed observation cited'] },
            { ...base, claim_id: '01C', claim_text: 'DREB% .999', claim_type: 'statistical', original_type: 'statistical', validation_status: 'dropped', evidence_ids: [], notes: ['does not match'] },
          ]}
        />
      </MemoryRouter>,
    )
    expect(screen.getByText('Statistic')).toBeInTheDocument()
    expect(screen.getByText(/downgraded from reviewed observation/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /01EVIDENCE/ })).toHaveAttribute('href', expect.stringContaining('/evidence'))
    const dropped = screen.getByText('DREB% .999')
    expect(dropped.closest('li')).toHaveAttribute('data-status', 'dropped')
    expect(screen.getByText(/no reviewed observation cited/)).toBeInTheDocument()
  })
  it('shows an empty state', () => {
    render(<MemoryRouter><ClaimList claims={[]} /></MemoryRouter>)
    expect(screen.getByText(/no claims yet/i)).toBeInTheDocument()
  })
})
