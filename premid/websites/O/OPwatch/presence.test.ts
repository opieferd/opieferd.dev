import { ActivityType } from 'premid'
import { expect, test } from 'premid/test'

test('shares the selected title and clears when sharing is turned off', async ({ page, activity }) => {
  await page.goto('https://opieferd.dev/watch/')
  await page.waitForUser('Open a movie or episode and enable Discord sharing below the player', {
    until: () => {
      const section = document.querySelector<HTMLElement>('#player-section')
      if (!section || section.hidden)
        return false
      try {
        const state = JSON.parse(section.dataset.discordPresence || 'null')
        return state?.enabled && state.active && Boolean(state.title)
      }
      catch {
        return false
      }
    },
  })
  expect(await activity.next()).toMatchObject({
    type: ActivityType.Watching,
    details: expect.any(String),
  })
  activity.clear()
  await page.click('#player-section .download-actions button[aria-pressed]')
  expect(await activity.next()).toBeUndefined()
})
