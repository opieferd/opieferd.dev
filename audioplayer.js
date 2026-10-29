const playPauseBtn = document.getElementById('playPauseBtn');
const audioPlayer = document.getElementById('audioPlayer');
if (playPauseBtn && audioPlayer) {
  const icon = playPauseBtn.querySelector('span, i');
  const seekBar = document.getElementById('audioSeek');
  const elapsedTime = document.getElementById('audioElapsed');
  const durationTime = document.getElementById('audioDuration');
  const formatTime = (seconds) => {
    const time = Math.max(0, Math.floor(seconds));
    return `${Math.floor(time / 60)}:${String(time % 60).padStart(2, '0')}`;
  };
  const updateTimeline = () => {
    if (!seekBar) return;
    const duration = audioPlayer.duration;
    const canSeek = !audioPlayer.error && Number.isFinite(duration) && duration > 0;
    const current = canSeek ? Math.min(duration, Math.max(0, audioPlayer.currentTime || 0)) : 0;
    seekBar.disabled = !canSeek;
    seekBar.max = canSeek ? String(duration) : '1';
    seekBar.value = String(current);
    seekBar.style.setProperty('--audio-progress', `${canSeek ? current / duration * 100 : 0}%`);
    seekBar.setAttribute('aria-valuetext', canSeek ? `${formatTime(current)} of ${formatTime(duration)}` : 'Track loading');
    if (elapsedTime) elapsedTime.textContent = formatTime(current);
    if (durationTime) durationTime.textContent = canSeek ? formatTime(duration) : '--:--';
  };
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
  ['loadedmetadata', 'durationchange', 'timeupdate', 'seeked', 'ended', 'emptied', 'error'].forEach((event) => {
    audioPlayer.addEventListener(event, updateTimeline);
  });
  if (seekBar) {
    seekBar.addEventListener('input', () => {
      if (seekBar.disabled) return;
      audioPlayer.currentTime = Math.min(audioPlayer.duration, Math.max(0, Number(seekBar.value)));
      updateTimeline();
    });
  }
  updateButton();
  updateTimeline();
}
