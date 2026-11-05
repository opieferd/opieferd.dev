import { ActivityType, Assets, getTimestamps } from 'premid'

const presence = new Presence({
  clientId: '1558711400132640918',
})

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
  catch {
    return null
  }
}

function matchesPlayer(url: string, playerUrl?: string) {
  try {
    return new URL(url).href === new URL(playerUrl || '').href
  }
  catch {
    return false
  }
}

presence.on('iFrameData', (data: FrameData) => {
  const state = readState()
  if (state && data && matchesPlayer(data.url, state.playerUrl))
    frame = data
})

presence.on('UpdateData', async () => {
  const state = readState()
  if (!state?.title || !state.playerUrl) {
    frame = null
    return presence.clearActivity()
  }
  const [strings, showCover, timestamps, privacy] = await Promise.all([
    presence.getStrings({
      play: 'general.playing',
      pause: 'general.paused',
      movie: 'general.watchingMovie',
      series: 'general.watchingSeries',
    }),
    presence.getSetting<boolean>('showCover'),
    presence.getSetting<boolean>('timestamps'),
    presence.getSetting<boolean>('privacy'),
  ])
  // Settings and localization are asynchronous. Do not publish an old title if
  // sharing was disabled or the selected episode changed while they loaded.
  if (readState()?.playerUrl !== state.playerUrl)
    return presence.clearActivity()

  const label = state.mediaType === 'tv'
    ? `S${state.season || 1} E${state.episode || 1}`
    : strings.movie
  const genericTitle = state.mediaType === 'tv' ? strings.series : strings.movie
  const data: PresenceData = {
    type: ActivityType.Watching,
    details: privacy ? genericTitle : state.title.slice(0, 128),
    state: privacy ? 'OPwatch' : label,
  }
  if (showCover && !privacy && state.image) {
    data.largeImageKey = state.image
    data.largeImageText = state.title.slice(0, 128)
  }
  const now = Date.now()
  const fresh = (value?: Playback | null) => value && Number.isFinite(value.updatedAt)
    && now >= value.updatedAt && now - value.updatedAt < 15000
  const video = frame && matchesPlayer(frame.url, state.playerUrl) && fresh(frame.video)
    ? frame.video
    : fresh(state.playback) ? state.playback : null
  if (video?.paused === true) {
    data.smallImageKey = Assets.Pause
    data.smallImageText = strings.pause
  }
  else if (video?.paused === false) {
    data.smallImageKey = Assets.Play
    data.smallImageText = strings.play
    if (timestamps && !privacy && Number.isFinite(video.currentTime)
      && video.currentTime >= 0 && Number.isFinite(video.duration) && video.duration > video.currentTime) {
      const position = Math.min(video.duration, video.currentTime + (now - video.updatedAt) / 1000)
      if (position < video.duration)
        [data.startTimestamp, data.endTimestamp] = getTimestamps(position, video.duration)
    }
  }
  return presence.setActivity(data)
})
