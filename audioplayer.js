const playPauseBtn = document.getElementById('playPauseBtn');
const audioPlayer = document.getElementById('audioPlayer');
if (playPauseBtn && audioPlayer) {
  const icon = playPauseBtn.querySelector('span, i');
  const updateButton = () => {
    const playing = !audioPlayer.paused;
    playPauseBtn.setAttribute('aria-label', playing ? 'Pause music' : 'Play music');
    if (icon) icon.textContent = playing ? 'Ⅱ' : '▶';
  };
  playPauseBtn.addEventListener('click', async () => {
    if (audioPlayer.paused) {
      try { await audioPlayer.play(); } catch (error) { console.warn('Audio could not start', error); }
    } else audioPlayer.pause();
    updateButton();
  });
  audioPlayer.addEventListener('play', updateButton);
  audioPlayer.addEventListener('pause', updateButton);
  audioPlayer.addEventListener('ended', updateButton);
  updateButton();
}
