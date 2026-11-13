'use strict';
// Run before the stylesheet to apply the saved choice without a light flash.
(() => {
  let theme = 'dark';
  try { if (localStorage.getItem('theme') === 'light') theme = 'light'; } catch {}
  document.documentElement.dataset.theme = theme;
  const color = document.querySelector('meta[name="theme-color"]');
  if (color) color.content = theme === 'light' ? '#e6eaff' : '#070a1a';
})();
