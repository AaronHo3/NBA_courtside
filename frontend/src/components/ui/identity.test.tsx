import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { PlayerIdentity, Portrait, TeamMark, initials, nbaHeadshotUrl, nbaLogoUrl } from './identity'

const box = (el: Element) => {
  const s = (el as HTMLElement).style
  return { width: s.width, height: s.height }
}

describe('identity', () => {
  it('falls back without changing size', () => {
    const { container } = render(<Portrait name="Jayson Tatum" src={nbaHeadshotUrl(1628369)} team="BOS" size="xl" />)
    const frame = container.firstElementChild as HTMLElement
    const before = box(frame)
    expect(before).toEqual({ width: '96px', height: '96px' })
    fireEvent.error(container.querySelector('img')!)
    const fallback = screen.getByTestId('portrait-fallback')
    expect(fallback).toHaveTextContent('JT')
    expect(box(fallback)).toEqual(before)
    expect(fallback.className).toContain('ring-2')
    expect(container.querySelector('img')).toBeNull()

    const { container: logo } = render(<TeamMark abbreviation="BOS" teamId={1610612738} />)
    const img = logo.querySelector('img')!
    expect(img).toHaveAttribute('src', nbaLogoUrl(1610612738))
    expect(box(img)).toEqual({ width: '20px', height: '20px' })
    fireEvent.error(img)
    const tricode = screen.getByTestId('teammark-fallback')
    expect(tricode).toHaveTextContent('BOS')
    expect(box(tricode)).toEqual({ width: '20px', height: '20px' })
  })

  it('uses the fallback straight away when there is no source, keeping the requested size', () => {
    render(<Portrait name="Unknown" src={null} size="sm" />)
    expect(box(screen.getByTestId('portrait-fallback'))).toEqual({ width: '32px', height: '32px' })
    render(<TeamMark abbreviation="LAL" teamId={null} size={18} />)
    expect(box(screen.getByTestId('teammark-fallback'))).toEqual({ width: '18px', height: '18px' })
  })

  it('names the team on both logo and tricode fallback', () => {
    render(<TeamMark abbreviation="NYK" teamId={null} />)
    expect(screen.getByRole('img', { name: 'NYK' })).toBeInTheDocument()
  })

  it('builds initials and links the name to the profile', () => {
    expect(initials('Shai Gilgeous-Alexander')).toBe('SG')
    expect(initials('Nene')).toBe('N')
    render(<MemoryRouter><PlayerIdentity playerId={203999} name="Nikola Jokic" team="DEN" teamId={1610612743} position="C" /></MemoryRouter>)
    expect(screen.getByRole('link', { name: 'Nikola Jokic' })).toHaveAttribute('href', '/players/203999')
  })
})
