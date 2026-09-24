// Renders github-profile/README.md roughly the way GitHub does (dark theme).
let rawMarkdown = '';

async function loadProfile() {
  const target = document.getElementById('profile-preview');
  try {
    const res = await fetch('github-profile/README.md');
    rawMarkdown = await res.text();
    target.innerHTML = marked.parse(rawMarkdown, { gfm: true });
  } catch (err) {
    target.textContent = 'README yüklenemedi: ' + err.message;
  }
}

document.getElementById('copy-button').addEventListener('click', async (e) => {
  try {
    await navigator.clipboard.writeText(rawMarkdown);
    e.target.textContent = 'Kopyalandı ✓';
  } catch {
    e.target.textContent = 'Kopyalanamadı';
  }
  setTimeout(() => (e.target.textContent = "Markdown'ı kopyala"), 2000);
});

loadProfile();
