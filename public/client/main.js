"use strict";
const getTreeRailElements = () => ({
    rail: document.getElementById('treeRail'),
    toggle: document.getElementById('treeRailToggle'),
});
const setupTypedClientShell = () => {
    const { rail, toggle } = getTreeRailElements();
    if (!rail || !toggle)
        return;
    toggle.addEventListener('click', () => {
        const collapsed = rail.classList.contains('is-collapsed');
        toggle.setAttribute('data-typed-shell', 'ready');
        toggle.setAttribute('aria-expanded', String(collapsed));
    });
};
document.addEventListener('DOMContentLoaded', setupTypedClientShell);
