(() => {
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
    const active = link.dataset.nav === current || (current === 'settings' && link.dataset.nav === 'dashboard' && window.location.hash === '#personal-space');
    link.classList.toggle('is-current', active);
    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
    if (!link.dataset.nav && targetPath === current) link.classList.add('is-current');
  });
})();
