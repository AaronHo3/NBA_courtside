/** In-page anchors, in reading order. Ids double as URL hashes. */
export const SECTIONS = [
  { id: 'data-status', title: 'Data status' },
  { id: 'coverage', title: 'Coverage matrix' },
  { id: 'sources', title: 'Sources & retrieval' },
  { id: 'metrics', title: 'Metric definitions' },
  { id: 'thresholds', title: 'Thresholds & normalisations' },
  { id: 'missing-data', title: 'Missing-data policy' },
  { id: 'uncertainty', title: 'Uncertainty' },
  { id: 'shooting', title: 'Shooting' },
  { id: 'matchups', title: 'Matchups' },
  { id: 'rankings', title: 'Rankings' },
  { id: 'measurements', title: 'Measurement provenance' },
  { id: 'demo', title: 'Demo dataset' },
  { id: 'video-coverage', title: 'Video coverage' },
  { id: 'limitations', title: 'Known limitations' },
] as const
export type SectionId = (typeof SECTIONS)[number]['id']
