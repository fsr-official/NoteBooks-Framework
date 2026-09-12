(() => {
  if (window.__noteBooksShellNavInitialized) return;
  window.__noteBooksShellNavInitialized = true;

  const toggle = document.querySelector('.global-nav-toggle');
  const links = document.querySelector('.global-nav-links');
  toggle?.addEventListener('click', () => {
    const open = links?.classList.toggle('is-open') || false;
    toggle.setAttribute('aria-expanded', String(open));
  });

  const current = window.location.pathname.replace(/^\/+|\/+$/g, '').split('/')[0] || 'home';
  document.querySelectorAll('.global-nav-links a[data-nav]').forEach((link) => {
    const target = link.getAttribute('href') || '';
    const targetPath = target.split('#')[0].replace(/^\/+|\/+$/g, '').split('/')[0] || 'home';
    const active = link.dataset.nav === current || targetPath === current;
    link.classList.toggle('is-current', active);
    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
})();
