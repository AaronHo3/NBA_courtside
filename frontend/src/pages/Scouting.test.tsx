import { render, screen, within } from '@testing-library/react'
import type { RoleTemplateDto } from '@/lib/types'
import { RoleSummary } from './scouting/RolePicker'

const role: RoleTemplateDto = {
  role_id: 'low_usage_perimeter_shooter', version: 1, label: 'Low-usage perimeter shooter', description: 'Floor spacer.',
  components: [
    { trait_key: 'fg3_pct', weight: 2, higher_is_better: true },
    { trait_key: 'tov_per100', weight: 0.5, higher_is_better: false },
    { trait_key: 'mystery_trait', weight: 1, higher_is_better: true },
  ],
  filters: [], optional_video_traits: [], caveats: [], is_builtin: true,
  cohort_defaults: { population: 'all', min_gp: 20, min_minutes: 400, position: null },
}

describe('Scouting', () => {
  it('shows role trait chips with display names', () => {
    render(<RoleSummary role={role} traitLabels={{ fg3_pct: '3P%', tov_per100: 'Turnovers per 100' }} />)
    const chips = within(screen.getByRole('list', { name: 'Components' }))
    expect(chips.getByText(/3P% × 2/)).toBeInTheDocument()
    expect(chips.getByText(/Turnovers per 100 × 0\.5/)).toBeInTheDocument()
    expect(chips.queryByText(/fg3_pct/)).not.toBeInTheDocument()
    // no verified mapping: the key stays rather than being guessed
    expect(chips.getByText(/mystery_trait × 1/)).toBeInTheDocument()
  })
})
