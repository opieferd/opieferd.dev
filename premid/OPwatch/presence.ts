import { ActivityType, getTimestamps } from 'premid'

const presence = new Presence({ clientId: '1558711400132640918' })

interface Playback {
  currentTime: number
  duration: number
  paused: boolean | null
  updatedAt: number
}
interface WatchState {
  version: number
  enabled: boolean
  active: boolean
  title?: string
  mediaId?: number
  mediaType?: string
  season?: number
  episode?: number
  image?: string
  playerUrl?: string
  playback?: Playback
}
interface FrameData {
  url: string
  video: Playback | null
}
let frame: FrameData | null = null

function readState(): WatchState | null {
  const section = document.querySelector<HTMLElement>('#player-section')
  if (!section || section.hidden)
    return null
  try {
    const state = JSON.parse(section.dataset.discordPresence || 'null') as WatchState | null
    return state?.version === 1 && state.enabled && state.active ? state : null
  }
  catch { return null }
}

function matchesPlayer(url: string, playerUrl?: string) {
  try { return new URL(url).href === new URL(playerUrl || '').href }
  catch { return false }
}

presence.on('iFrameData', (data: FrameData) => {
  const state = readState()
  // A delayed update from the previous episode or an unrelated embed must not
  // change the new title's progress. Only the selected provider frame counts.
  if (state && data && matchesPlayer(data.url, state.playerUrl))
    frame = data
})

presence.on('UpdateData', () => {
  const state = readState()
  if (!state?.title || !state.playerUrl) {
    frame = null
    return presence.clearActivity()
  }
  const label = state.mediaType === 'tv'
    ? `S${state.season || 1} E${state.episode || 1}`
    : 'Movie'
  const data: PresenceData = {
    type: ActivityType.Watching,
    details: state.title.slice(0, 128),
    state: `${label} · opieferd.dev/watch`,
    largeImageKey: state.image || 'https://opieferd.dev/favicon.png',
    largeImageText: state.title.slice(0, 128),
    buttons: [{ label: 'Watch on opieferd.dev', url: 'https://opieferd.dev/watch/' }],
  }
  const now = Date.now()
  const fresh = (value?: Playback | null) => value && Number.isFinite(value.updatedAt)
    && now >= value.updatedAt && now - value.updatedAt < 15000
  const video = frame && matchesPlayer(frame.url, state.playerUrl) && fresh(frame.video)
    ? frame.video
    : fresh(state.playback) ? state.playback : null
  if (video?.paused === true) {
    data.state = `Paused · ${label}`
  }
  else if (video?.paused === false && Number.isFinite(video.currentTime)
    && video.currentTime >= 0 && Number.isFinite(video.duration) && video.duration > video.currentTime) {
    // Account for the gap between the player sample and this extension tick.
    const position = Math.min(video.duration, video.currentTime + (now - video.updatedAt) / 1000)
    if (position < video.duration)
      [data.startTimestamp, data.endTimestamp] = getTimestamps(position, video.duration)
  }
  return presence.setActivity(data)
})
