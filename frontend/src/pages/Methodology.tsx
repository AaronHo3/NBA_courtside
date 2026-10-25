import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { PageHeader } from '@/components/layout/PageHeader'
import { CoverageMatrix } from './methodology/CoverageMatrix'
import { DataStatus } from './methodology/DataStatus'
import { MetricCatalog } from './methodology/MetricCatalog'
import { MatchupsSection, MissingDataSection, RankingsSection, ShootingSection, ThresholdsSection, UncertaintySection } from './methodology/MethodsSections'
import { DemoSection, LimitationsSection, MeasurementsSection } from './methodology/ProvenanceSections'
import { SectionNav } from './methodology/SectionNav'
import { SourcesTable } from './methodology/SourcesTable'
import { VideoCoverageSection } from './methodology/VideoCoverageSection'

export default function Methodology() {
  const { hash } = useLocation()
  // Lazy routes mount after the browser's native hash jump; scroll once the sections exist.
  useEffect(() => {
    if (!hash) return
    const el = document.getElementById(hash.slice(1))
    el?.scrollIntoView({ block: 'start' })
  }, [hash])

  return (
    <>
      <PageHeader title="Where the numbers come from" lede="Data status, coverage, sources, every metric's definition and the analytical rules behind each view. The repository mirrors this page in docs/METHODOLOGY.md and docs/LIMITATIONS.md." />
      <div className="flex min-w-0 flex-col gap-4 lg:grid lg:grid-cols-[200px_minmax(0,1fr)]">
        <SectionNav />
        <div className="flex min-w-0 flex-col gap-4">
          <DataStatus />
          <CoverageMatrix />
          <SourcesTable />
          <MetricCatalog />
          <ThresholdsSection />
          <MissingDataSection />
          <UncertaintySection />
          <ShootingSection />
          <MatchupsSection />
          <RankingsSection />
          <MeasurementsSection />
          <DemoSection />
          <VideoCoverageSection />
          <LimitationsSection />
        </div>
      </div>
    </>
  )
}
