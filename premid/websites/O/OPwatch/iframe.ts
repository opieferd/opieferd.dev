const iframe = new iFrame()

iframe.on('UpdateData', () => {
  const videos = [...document.querySelectorAll<HTMLVideoElement>('video')]
    .filter(video => video.readyState >= 1 && Number.isFinite(video.duration) && video.duration > 0)
    .sort((a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight)
  const video = videos[0]
  iframe.send({
    url: document.location.href,
    video: video ? {
      currentTime: video.currentTime,
      duration: video.duration,
      paused: video.paused || video.ended,
      updatedAt: Date.now(),
    } : null,
  })
})
