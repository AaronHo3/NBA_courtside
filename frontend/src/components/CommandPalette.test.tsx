import { useState } from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { CommandPalette } from './CommandPalette'

const navigate = vi.fn()
vi.mock('react-router-dom', async (orig) => ({ ...(await orig<typeof import('react-router-dom')>()), useNavigate: () => navigate }))
vi.mock('@/hooks/useApi', () => ({
  usePlayerSearch: (q: string) => ({ isLoading: false, data: q === 'leb' ? { data: [{ player_id: 2544, full_name: 'LeBron James', position: 'F', is_active: true, from_year: 2003, to_year: 2025, team_abbreviation: 'LAL' }] } : undefined }),
}))

describe('CommandPalette', () => {
  it('lists pages when empty and players when typing; Enter navigates', async () => {
    const onClose = vi.fn()
    render(<MemoryRouter><CommandPalette open onClose={onClose} sessionId="s1" /></MemoryRouter>)
    expect(screen.getByRole('option', { name: /Overview/ })).toBeInTheDocument()
    const input = screen.getByRole('combobox', { name: /Search players and pages/ })
    fireEvent.change(input, { target: { value: 'leb' } })
    expect(await screen.findByRole('option', { name: /LeBron James/ })).toBeInTheDocument()
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(navigate).toHaveBeenCalledWith('/players/2544')
    expect(onClose).toHaveBeenCalled()
  })
  it('closes on Escape and links fantasy pages to the session', async () => {
    const onClose = vi.fn()
    render(<MemoryRouter><CommandPalette open onClose={onClose} sessionId="s1" /></MemoryRouter>)
    const input = screen.getByRole('combobox', { name: /Search players and pages/ })
    fireEvent.change(input, { target: { value: 'draft' } })
    expect((await screen.findAllByRole('option', { name: /Draft/ }))[0]).toBeInTheDocument()
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(navigate).toHaveBeenCalledWith('/fantasy?session=s1#/draft')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })
  it('moves focus into the search box, closes on Escape and returns focus to the opener', async () => {
    function Harness() {
      const [open, setOpen] = useState(false)
      return (
        <MemoryRouter>
          <button type="button" onClick={() => setOpen(true)}>Open search</button>
          <CommandPalette open={open} onClose={() => setOpen(false)} sessionId={null} />
        </MemoryRouter>
      )
    }
    render(<Harness />)
    const opener = screen.getByRole('button', { name: 'Open search' })
    opener.focus()
    fireEvent.click(opener)
    const input = await screen.findByRole('combobox', { name: /Search players and pages/ })
    await waitFor(() => expect(input).toHaveFocus())
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(opener).toHaveFocus()
  })
  it('keeps Tab inside the dialog', async () => {
    render(<MemoryRouter><CommandPalette open onClose={vi.fn()} sessionId={null} /></MemoryRouter>)
    const input = screen.getByRole('combobox', { name: /Search players and pages/ })
    await waitFor(() => expect(input).toHaveFocus())
    fireEvent.keyDown(input, { key: 'Tab' })
    expect(input).toHaveFocus()
  })
})
