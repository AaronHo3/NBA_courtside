import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { expect, test } from '@playwright/test'

/**
 * Evidence review workbench (scouting B-09). The upload -> ready -> annotate -> review journey runs only when the
 * machine has ffmpeg and something drains the job queue; otherwise the degraded states are asserted instead.
 */
test.describe('evidence review', () => {
  test('library shows capabilities, footage table and evidence items', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.goto('/evidence')
    await expect(page.getByRole('heading', { name: 'Evidence library' })).toBeVisible()
    await expect(page.getByTestId('capability-banner')).toBeVisible()
    await expect(page.getByText('Which evidence items exist?')).toBeVisible()
    await expect(page.getByTestId('snapshots')).toBeVisible()
    expect(errors).toEqual([])
  })

  test('unknown asset renders the not-found state', async ({ page }) => {
    await page.goto('/evidence/01HZZZZZZZZZZZZZZZZZZZZZZZ')
    await expect(page.getByRole('heading', { name: 'Footage not found' })).toBeVisible()
  })

  test('upload with a permission statement, then segment, anchor, annotate and review', async ({ page }) => {
    const caps = (await (await page.request.get('/api/analytics/meta/capabilities')).json()).data
    test.skip(!caps.ffmpeg.available, 'ffmpeg not installed')
    let ffmpeg = 'ffmpeg'
    try { execFileSync('which', ['ffmpeg']) } catch { ffmpeg = '/opt/homebrew/bin/ffmpeg' }
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'courtside-e2e-'))
    const clip = path.join(dir, `clip-${Date.now()}.mp4`)
    execFileSync(ffmpeg, ['-loglevel', 'error', '-f', 'lavfi', '-i', `testsrc=size=320x240:rate=30:duration=3`, '-f', 'lavfi', '-i', `sine=frequency=${300 + (Date.now() % 500)}:duration=3`, '-pix_fmt', 'yuv420p', '-shortest', clip])
    const drains = caps.worker_alive || caps.jobs?.inline
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))

    await page.goto('/evidence?upload=1')
    const dialog = page.getByTestId('upload-dialog')
    await dialog.getByLabel('Video file').setInputFiles(clip)
    await dialog.getByLabel(/Permission source/).selectOption('own_recording')
    await dialog.getByRole('button', { name: 'Upload' }).click()
    await expect(page).toHaveURL(/\/evidence\/[0-9A-Z]{26}/)
    const stateCard = page.getByTestId('asset-state')
    await expect(stateCard).toBeVisible()

    if (!drains) {
      await expect(stateCard).toHaveAttribute('data-state', /no_worker|processing/)
      await expect(page.getByText(/no worker/i).first()).toBeVisible()
      return
    }
    await expect(stateCard).toHaveAttribute('data-state', 'ready', { timeout: 90_000 })
    await expect(page.getByTestId('video')).toBeVisible()

    // segment covering the clip
    const segList = page.getByTestId('segment-list')
    await segList.getByLabel('Start (ms)').fill('0')
    await segList.getByLabel('End (ms)').fill('2500')
    await segList.getByRole('button', { name: 'Add segment' }).click()
    const segRow = segList.locator('li').first()
    await expect(segRow).toBeVisible()
    await segRow.getByRole('button', { name: /0:00\.0/ }).click()
    await expect(page).toHaveURL(/seg=[0-9A-Z]{26}/)

    // anchor at the playhead
    await page.getByRole('radio', { name: /Anchors/ }).or(page.getByRole('button', { name: /Anchors/ })).first().click()
    const anchors = page.getByTestId('anchor-editor')
    await anchors.getByLabel('Clock (m:ss.t)').fill('11:48.0')
    await anchors.getByRole('button', { name: 'Add anchor' }).click()
    await expect(anchors.getByText(/Q1 11:48/).first()).toBeVisible()
    await expect(page.getByTestId('alignment-report')).toBeVisible()

    // window via keyboard, then annotate
    await page.keyboard.press('[')
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press(']')
    await expect(page).toHaveURL(/in=\d+/)
    await page.getByRole('radio', { name: /Annotations/ }).or(page.getByRole('button', { name: /Annotations/ })).first().click()
    const form = page.getByTestId('annotation-form')
    await form.getByRole('combobox', { name: /^Action/ }).selectOption('closeout')
    await form.getByRole('combobox', { name: /^Outcome/ }).selectOption('late')
    await form.getByRole('combobox', { name: /^Sampling method/ }).selectOption('curated')
    await form.getByRole('button', { name: 'Save annotation' }).click()
    const list = page.getByTestId('annotation-list')
    await expect(list.getByText('closeout').first()).toBeVisible()
    await expect(list.getByText('no subject').first()).toBeVisible()
    await list.getByTestId('review-bar').first().getByRole('button', { name: 'OK', exact: true }).click()
    await expect(list.getByText('Reviewed OK').first()).toBeVisible()
    await expect(list.getByText(/rev 2/).first()).toBeVisible()
    expect(errors).toEqual([])

    // leave the real namespace as found: the synthetic clip and its annotation are soft-deleted (history kept)
    const assetId = page.url().match(/\/evidence\/([0-9A-Z]{26})/)?.[1]
    const annIds = (await (await page.request.get(`/api/analytics/annotations?asset_id=${assetId}&limit=50`)).json()).data.map((a: { annotation_id: string }) => a.annotation_id)
    for (const id of annIds) await page.request.delete(`/api/analytics/annotations/${id}?changed_by=e2e&reason=e2e%20artefact`)
    await page.request.delete(`/api/analytics/media/${assetId}`)
  })
})
