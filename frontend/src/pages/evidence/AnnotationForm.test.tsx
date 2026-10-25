import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { AnnotationForm } from './AnnotationForm'

const vocab = [
  { action: 'closeout', definition: 'Defender runs at a shooter', outcomes: ['contest_hand_up', 'late'] },
  { action: 'drive', definition: 'Attacks the basket', outcomes: ['finish_made', 'kick_out'] },
  { action: 'unknown', definition: 'Could not be determined', outcomes: [] },
]
const roster = [{ player_id: 1628369, full_name: 'Jayson Tatum', team_abbreviation: 'BOS', team_id: 1, position: 'F' }]
const segment = { segment_id: '01SEG000000000000000000000', media_start_ms: 0, media_end_ms: 99_000, classification: 'live' as const }

describe('AnnotationForm', () => {
  it('filters outcomes by action and submits the vocabulary-shaped body', () => {
    const onSubmit = vi.fn()
    render(<AnnotationForm vocab={vocab} roster={roster} segment={segment} windowMs={[10_000, 16_000]} eventKey={null} onSubmit={onSubmit} busy={false} />)
    fireEvent.change(screen.getByLabelText('Action'), { target: { value: 'closeout' } })
    const outcome = screen.getByLabelText('Outcome') as HTMLSelectElement
    expect(Array.from(outcome.options).map((o) => o.value)).toEqual(['', 'contest_hand_up', 'late'])
    fireEvent.change(outcome, { target: { value: 'late' } })
    fireEvent.change(screen.getByLabelText('Sampling method'), { target: { value: 'curated' } })
    fireEvent.change(screen.getByLabelText('Subject'), { target: { value: '1628369' } })
    fireEvent.change(screen.getByLabelText('Identity'), { target: { value: 'asserted' } })
    fireEvent.click(screen.getByRole('button', { name: /save annotation/i }))
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      segment_id: segment.segment_id, media_start_ms: 10_000, media_end_ms: 16_000, action: 'closeout', outcome: 'late',
      sampling_method: 'curated', subject_player_id: 1628369, subject_identity_status: 'asserted', visibility: 'full',
    }))
  })
  it('blocks saving when a subject is chosen but identity is unknown, and when sampling is missing', () => {
    const onSubmit = vi.fn()
    render(<AnnotationForm vocab={vocab} roster={roster} segment={segment} windowMs={[10_000, 16_000]} eventKey={null} onSubmit={onSubmit} busy={false} />)
    fireEvent.change(screen.getByLabelText('Action'), { target: { value: 'drive' } })
    fireEvent.change(screen.getByLabelText('Subject'), { target: { value: '1628369' } })
    fireEvent.click(screen.getByRole('button', { name: /save annotation/i }))
    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(/identity/i)
    fireEvent.change(screen.getByLabelText('Identity'), { target: { value: 'verified' } })
    fireEvent.click(screen.getByRole('button', { name: /save annotation/i }))
    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByText(/sampling method is required/i)).toBeInTheDocument()
  })
  it('needs a segment', () => {
    render(<AnnotationForm vocab={vocab} roster={roster} segment={null} windowMs={[0, 1000]} eventKey={null} onSubmit={() => {}} busy={false} />)
    expect(screen.getByText(/select a segment/i)).toBeInTheDocument()
  })
})
