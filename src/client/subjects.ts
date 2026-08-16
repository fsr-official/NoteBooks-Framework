export async function initSubjectShell(slug: string) {
  const target = document.querySelector('#subjectLanding') || document.querySelector('.app-shell') || document.body;
  try {
    const res = await fetch(`/public/subjects/${slug}.html`);
    if (!res.ok) throw new Error('Subject fragment not found');
    const html = await res.text();
    if (target) {
      // Clear previous
      target.innerHTML = html;
      // Add stylesheet if not already present
      if (!document.querySelector('link[data-subjects-css]')) {
        const l = document.createElement('link');
        l.rel = 'stylesheet';
        l.setAttribute('data-subjects-css', '1');
        l.href = '/public/subjects/subjects.css';
        document.head.appendChild(l);
      }
      // Initialize markdown and runtime features if available
      // markdownToHTML and initMarkdownFeatures are in public/markdown.js
      if ((window as any).markdownToHTML) {
        (window as any).markdownToHTML(target);
      }
      if ((window as any).initMarkdownFeatures) {
        (window as any).initMarkdownFeatures(target);
      }
    }
  } catch (err) {
    console.error('[subjects] failed to load subject shell', err);
    if (target) target.innerHTML = '<div class="subject-page"><p>Could not load subject.</p></div>';
  }
}
