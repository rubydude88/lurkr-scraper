export function initTheme(): void {
  applyTheme(localStorage.getItem('scraperkit_theme') || 'dark');
}

export function applyTheme(theme: string): void {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('scraperkit_theme', theme);
  const dark = theme === 'dark';
  document.getElementById('icon-sun')?.classList.toggle('hidden', dark);
  document.getElementById('icon-moon')?.classList.toggle('hidden', !dark);
}

export function toggleTheme(): void {
  applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
}
