import { PageHeader } from '@/components/layout/PageHeader'
import { EmptyState, LinkButton } from '@/components/ui'

export default function NotFound() {
  return (
    <>
      <PageHeader title="Nothing here" lede="That address doesn't match a view." />
      <EmptyState title="Page not found" body="The link may be out of date, or the view was renamed." action={<LinkButton to="/" size="sm">Back to the league explorer</LinkButton>} />
    </>
  )
}
