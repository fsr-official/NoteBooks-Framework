/* NoteBooks local landing-document runtime. */
async function initLocalLandingDocs() {
    const target = document.getElementById('landingDocs');
    if (!target) return;
    try {
        const response = await fetch(`/files.json?_=${Date.now()}`, { cache: 'no-store' });
        if (!response.ok) throw new Error(`Local files manifest unavailable (${response.status})`);
        const manifest = await response.json();
        const wanted = new Map([
            ['README.md', { label: 'README.md', description: 'Project overview and getting-started context.' }],
            ['docs/archive/ARCHITECTURE.md', { label: 'ARCHITECTURE.md', description: 'The current system architecture and implementation boundaries.' }]
        ]);
        const found = [];
        const visit = (node) => {
            if (!node) return;
            if (node.type === 'file' && wanted.has(node.path)) found.push({ ...wanted.get(node.path), path: node.path });
            (node.children || []).forEach(visit);
        };
        visit(manifest);
        target.innerHTML = found.length
            ? found.map((doc) => `<a class="landing-doc-card" href="/files/${doc.path.split('/').map((segment) => encodeURIComponent(segment)).join('/')}" data-local-doc="${doc.path}"><strong>${doc.label}</strong><span>${doc.description}</span><small>Open local document →</small></a>`).join('')
            : '<p class="landing-doc-empty">No local project documents are listed in files.json.</p>';
    } catch (error) {
        target.innerHTML = '<p class="landing-doc-empty">Local project documents are unavailable right now.</p>';
        console.warn('[landing-docs] local files manifest unavailable', error);
    }
}
