(() => {
  if (window.__noteBooksSettingsNavInitialized) return;
  window.__noteBooksSettingsNavInitialized = true;

  const links = [...document.querySelectorAll('.settings-section-nav a[href^="#"]')];
  if (!links.length) return;

  const sync = () => {
    const hash = window.location.hash || '#personal-space';
    links.forEach((link) => {
      const active = link.getAttribute('href') === hash;
      link.toggleAttribute('aria-current', active);
    });
  };

  links.forEach((link) => link.addEventListener('click', () => {
    window.requestAnimationFrame(sync);
  }));
  window.addEventListener('hashchange', sync, { passive: true });
  sync();
})();
