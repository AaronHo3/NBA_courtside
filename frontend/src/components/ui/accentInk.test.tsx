import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render, screen } from '@testing-library/react'
import { Button, Segmented } from './index'

// Guards the fix for the native-control reset: utilities must reach <button>, so no `!` patch is needed.
describe('accent ink on accent fills', () => {
  it('the selected segmented option and the primary button use text-accent-ink', () => {
    render(
      <>
        <Segmented ariaLabel="Scale" value="a" onChange={() => {}} options={[{ value: 'a', label: 'Alpha' }, { value: 'b', label: 'Beta' }]} />
        <Button variant="primary">Go</Button>
      </>,
    )
    const selected = screen.getByRole('radio', { name: 'Alpha' })
    expect(selected).toHaveClass('bg-accent', 'text-accent-ink')
    expect(screen.getByRole('radio', { name: 'Beta' })).not.toHaveClass('text-accent-ink')
    expect(screen.getByRole('button', { name: 'Go' })).toHaveClass('bg-accent', 'text-accent-ink')
  })

  it('keeps the native-control reset inside @layer base so utilities win', () => {
    const css = readFileSync(resolve(__dirname, '../../index.css'), 'utf8')
    expect(css).toMatch(/@layer base \{\s*select, input, button, textarea \{ font: inherit; color: inherit; \}/)
  })
})
