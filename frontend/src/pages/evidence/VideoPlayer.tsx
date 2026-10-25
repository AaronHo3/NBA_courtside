import { useEffect, useRef } from 'react'

/** HTML5 playback of the managed derivative; the page owns time so the timeline and shortcuts stay in sync. */
export function VideoPlayer({ src, seekToMs, onTime, onDuration }: { src: string; seekToMs: number | null; onTime: (ms: number) => void; onDuration: (ms: number) => void }) {
  const ref = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    const v = ref.current
    if (v && seekToMs !== null && Math.abs(v.currentTime * 1000 - seekToMs) > 40) v.currentTime = seekToMs / 1000
  }, [seekToMs])
  return (
    <video
      ref={ref}
      src={src}
      controls
      preload="metadata"
      className="w-full rounded-[var(--radius-control)] bg-black"
      data-testid="video"
      onTimeUpdate={(e) => onTime(Math.round(e.currentTarget.currentTime * 1000))}
      onLoadedMetadata={(e) => onDuration(Math.round(e.currentTarget.duration * 1000))}
      onSeeked={(e) => onTime(Math.round(e.currentTarget.currentTime * 1000))}
    />
  )
}
