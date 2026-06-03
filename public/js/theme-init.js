// Prevent flash of wrong theme — runs before React hydrates
(function() {
  try {
    var stored = localStorage.getItem('app_theme');
    var theme = (stored === 'light' || stored === 'dark' || stored === 'system') ? stored : 'system';
    var isDark;
    if (theme === 'system') {
      isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    } else {
      isDark = theme === 'dark';
    }
    var resolved = isDark ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', resolved);
    document.documentElement.classList.add(resolved);
    document.documentElement.classList.remove(isDark ? 'light' : 'dark');
  } catch(e) {}
})();
