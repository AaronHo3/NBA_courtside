import { expect, test, type Page } from '@playwright/test'

/** Which shell region the focused element sits in. */
async function focusedRegion(page: Page): Promise<string> {
  return page.evaluate(() => {
    const el = document.activeElement
    if (!el || el === document.body) return 'body'
    if (el.classList.contains('skip-link')) return 'skip'
    if (el.closest('aside')) return 'sidebar'
    if (el.closest('header')) return 'header'
    if (el.closest('main')) return 'main'
    if (el.closest('[role="status"]')) return 'banner'
    return `other:${el.tagName.toLowerCase()}`
  })
}

test.describe('accessibility', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('Tab order from page load: skip link, sidebar, header controls, then main', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('navigation', { name: 'Primary' }).first()).toBeVisible()
    await expect(page.locator('#main-content')).toBeVisible()

    await page.keyboard.press('Tab')
    await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused()

    const sequence: string[] = []
    for (let i = 0; i < 80; i++) {
      const region = await focusedRegion(page)
      if (sequence[sequence.length - 1] !== region) sequence.push(region)
      if (region === 'main') break
      await page.keyboard.press('Tab')
    }
    // The demo-data notice (when serving demo data) sits between the sidebar and the header in the DOM.
    expect(sequence.filter((r) => r !== 'banner')).toEqual(['skip', 'sidebar', 'header', 'main'])
  })

  test('the skip link moves focus to main', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('#main-content')).toBeVisible()
    await page.keyboard.press('Tab')
    await page.keyboard.press('Enter')
    await expect(page.locator('#main-content')).toBeFocused()
  })

  test.describe('reduced motion', () => {
    test.use({ reducedMotion: 'reduce' })

    test('skeletons do not animate', async ({ page }) => {
      await page.goto('/')
      await expect(page.locator('#main-content')).toBeVisible()
      const name = await page.evaluate(() => {
        const el = document.createElement('span')
        el.className = 'skeleton block'
        document.getElementById('main-content')?.appendChild(el)
        const value = getComputedStyle(el).animationName
        el.remove()
        return value
      })
      expect(name).toBe('none')
    })
  })

  test('skeletons shimmer when motion is allowed (the reduced-motion check is not vacuous)', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await page.goto('/')
    await expect(page.locator('#main-content')).toBeVisible()
    const name = await page.evaluate(() => {
      const el = document.createElement('span')
      el.className = 'skeleton block'
      document.getElementById('main-content')?.appendChild(el)
      const value = getComputedStyle(el).animationName
      el.remove()
      return value
    })
    expect(name).toBe('shimmer')
  })
})
