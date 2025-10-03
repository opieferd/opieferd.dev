async function fetchCount() {
  const res = await fetch('/api/meow');
  const data = await res.json();
  document.getElementById('meowCount').textContent = `Global meow count: ${data.count}`;
}

document.getElementById('meowBtn').addEventListener('click', async () => {
  document.getElementById('meowBtn').disabled = true;
  const res = await fetch('/api/meow', { method: 'POST' });
  const data = await res.json();
  document.getElementById('meowCount').textContent = `Global meow count: ${data.count}`;
  document.getElementById('meowBtn').disabled = false;
});

fetchCount();
