import { Badge, Select } from '@/components/ui'
import type { RoleTemplateDto } from '@/lib/types'
import { roleCaveatText } from './model'

export function RolePicker({ roles, value, onChange }: { roles: RoleTemplateDto[]; value: string; onChange: (id: string) => void }) {
  const role = roles.find((r) => r.role_id === value) ?? roles[0]
  return (
    <div className="flex flex-col gap-3">
      <Select label="Role template" value={role?.role_id ?? value} onChange={(e) => onChange(e.target.value)} className="max-w-sm">
        {roles.map((r) => <option key={r.role_id} value={r.role_id}>{r.label}{r.is_builtin ? '' : ' (custom)'}</option>)}
      </Select>
      {role && (
        <>
          <p className="max-w-prose text-sm text-ink-2">{role.description}</p>
          <div className="flex flex-wrap gap-1.5" aria-label="Components">
            {role.components.map((c) => <Badge key={c.trait_key} tone="accent">{c.trait_key} × {c.weight}{c.higher_is_better === false ? ' ↓' : ''}</Badge>)}
          </div>
          {role.filters.length > 0 && <p className="text-xs text-ink-3">Filters before scoring: {role.filters.map((f) => f.label).join(' · ')}</p>}
          {role.optional_video_traits.length > 0 && <p className="text-xs text-ink-3">Video traits shown beside the ranking (never scored): {role.optional_video_traits.join(', ')}</p>}
          {role.caveats.length > 0 && <p className="max-w-prose text-xs text-warning">{roleCaveatText(role.caveats)}</p>}
        </>
      )}
    </div>
  )
}
