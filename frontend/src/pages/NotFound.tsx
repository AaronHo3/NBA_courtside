import { Link } from 'react-router-dom'
import { PageHeader } from '@/components/layout/PageHeader'

export default function NotFound() {
  return (
    <>
      <PageHeader title="Nothing here" lede="That address doesn't match a view." />
      <Link to="/" className="text-accent hover:underline">Back to the league explorer</Link>
    </>
  )
}
