import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ExternalReferenceButton } from './ExternalReferenceButton'

const URL = 'https://www.nba.com/stats/events/?GameID=0022400061&GameEventID=7&flag=1'

describe('ExternalReferenceButton', () => {
  it('opens the provider page in a new tab for an unverified reference and says so', () => {
    render(<ExternalReferenceButton url={URL} availability="unverified" />)
    const link = screen.getByRole('link', { name: /open on nba\.com/i })
    expect(link).toHaveAttribute('href', URL)
    expect(link).toHaveAttribute('target', '_blank')
    expect(link.getAttribute('rel')).toContain('noopener')
    expect(screen.getByText('Unverified reference')).toBeInTheDocument()
  })
  it('shows provider metadata when the reference was verified', () => {
    render(<ExternalReferenceButton url={URL} availability="available" checkedAt="2026-10-09T08:00:00Z" metadata={{ description: "Tatum 27' 3PT", duration_ms: 12750 }} />)
    expect(screen.getByText('Clip listed by provider')).toBeInTheDocument()
    expect(screen.getByText(/12\.8 s clip/)).toBeInTheDocument()
  })
  it('does not render a link when the provider reported nothing', () => {
    render(<ExternalReferenceButton url={URL} availability="unavailable" />)
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.getByText(/no clip is listed/i)).toBeInTheDocument()
  })
})
