const playPauseBtn = document.getElementById('playPauseBtn');
const audioPlayer = document.getElementById('audioPlayer');
const icon = playPauseBtn.querySelector('i');

playPauseBtn.addEventListener('click', () => {
  if (audioPlayer.paused) {
    audioPlayer.play();
    icon.classList.remove('fa-play');
    icon.classList.add('fa-pause');
  } else {
    audioPlayer.pause();
    icon.classList.remove('fa-pause');
    icon.classList.add('fa-play');
  }
});

// Reset to play button when song ends
audioPlayer.addEventListener('ended', () => {
  icon.classList.remove('fa-pause');
  icon.classList.add('fa-play');
});
