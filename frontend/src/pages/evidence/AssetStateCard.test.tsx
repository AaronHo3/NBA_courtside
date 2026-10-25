import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AssetStateCard } from './AssetStateCard'

describe('AssetStateCard', () => {
  it('renders the degraded explanation and a retry button for a failed job', () => {
    const retry = vi.fn()
    render(<AssetStateCard state={{ key: 'failed', label: 'Processing failed', explanation: 'probe: duration exceeds limit', canPlay: false, canRetry: true }} onRetry={retry} />)
    expect(screen.getByText('Processing failed')).toBeInTheDocument()
    expect(screen.getByText(/duration exceeds limit/)).toBeInTheDocument()
    screen.getByRole('button', { name: /retry/i }).click()
    expect(retry).toHaveBeenCalled()
  })
  it('has no retry button when nothing can be retried and marks the state for tests', () => {
    render(<AssetStateCard state={{ key: 'no_ffmpeg', label: 'ffmpeg unavailable', explanation: 'Install ffmpeg', canPlay: false, canRetry: false }} onRetry={() => {}} />)
    expect(screen.queryByRole('button', { name: /retry/i })).toBeNull()
    expect(screen.getByTestId('asset-state')).toHaveAttribute('data-state', 'no_ffmpeg')
  })
})
