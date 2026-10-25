import { Badge, Select } from '@/components/ui'
import type { RoleTemplateDto } from '@/lib/types'
import { roleCaveatText, traitLabel } from './model'

/** Template picker for the page toolbar; the accessible name "Role template" is what e2e drives. */
export function RoleSelect({ roles, value, onChange }: { roles: RoleTemplateDto[]; value: string; onChange: (id: string) => void }) {
  const role = roles.find((r) => r.role_id === value) ?? roles[0]
  return (
    <Select label="Role template" value={role?.role_id ?? value} onChange={(e) => onChange(e.target.value)} className="min-w-56">
      {roles.map((r) => <option key={r.role_id} value={r.role_id}>{r.label}{r.is_builtin ? '' : ' (custom)'}</option>)}
    </Select>
  )
}

/** What the chosen template scores: trait chips by registry display name, filters, video traits and caveats. */
export function RoleSummary({ role, traitLabels }: { role: RoleTemplateDto; traitLabels: Record<string, string> }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="max-w-prose text-sm text-ink-2">{role.description}</p>
      <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0" aria-label="Components">
        {role.components.map((c) => (
          <li key={c.trait_key}>
            <Badge tone="accent">{`${traitLabel(traitLabels, c.trait_key)} × ${c.weight}${c.higher_is_better === false ? ' ↓' : ''}`}</Badge>
          </li>
        ))}
      </ul>
      {role.filters.length > 0 && <p className="text-xs text-ink-2">Filters before scoring: {role.filters.map((f) => f.label).join(' · ')}</p>}
      {role.optional_video_traits.length > 0 && <p className="text-xs text-ink-2">Video traits shown beside the ranking (never scored): {role.optional_video_traits.map((k) => traitLabel(traitLabels, k)).join(', ')}</p>}
      {role.caveats.length > 0 && <p className="max-w-prose text-xs text-warning">{roleCaveatText(role.caveats)}</p>}
    </div>
  )
}
