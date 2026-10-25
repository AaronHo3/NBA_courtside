import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { UploadDialog } from './UploadDialog'

describe('UploadDialog', () => {
  it('requires a permission source and warns when ffmpeg is missing', () => {
    const onSubmit = vi.fn()
    render(<UploadDialog ffmpegAvailable={false} maxBytes={1_000_000} onSubmit={onSubmit} busy={false} />)
    expect(screen.getByText(/ffmpeg is not installed/i)).toBeInTheDocument()
    const submit = screen.getByRole('button', { name: /upload/i })
    expect(submit).toBeDisabled()
    const file = new File([new Uint8Array(10)], 'clip.mp4', { type: 'video/mp4' })
    fireEvent.change(screen.getByLabelText(/video file/i), { target: { files: [file] } })
    fireEvent.change(screen.getByLabelText(/permission source/i), { target: { value: 'own_recording' } })
    expect(submit).toBeEnabled()
    fireEvent.click(submit)
    expect(onSubmit).toHaveBeenCalledTimes(1)
    const fd = onSubmit.mock.calls[0][0] as FormData
    expect(fd.get('permission_source')).toBe('own_recording')
    expect((fd.get('file') as File).name).toBe('clip.mp4')
    expect(String(fd.get('allowed_operations'))).toContain('view')
  })
  it('refuses files over the configured limit', () => {
    render(<UploadDialog ffmpegAvailable maxBytes={5} onSubmit={() => {}} busy={false} />)
    const file = new File([new Uint8Array(10)], 'big.mp4', { type: 'video/mp4' })
    fireEvent.change(screen.getByLabelText(/video file/i), { target: { files: [file] } })
    expect(screen.getByText(/larger than the limit/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /upload/i })).toBeDisabled()
  })
})
