interface TreeRailElements {
  rail: HTMLElement | null
  toggle: HTMLButtonElement | null
}

const getTreeRailElements = (): TreeRailElements => ({
  rail: document.getElementById('treeRail'),
  toggle: document.getElementById('treeRailToggle') as HTMLButtonElement | null,
})

const setupTypedClientShell = (): void => {
  const { rail, toggle } = getTreeRailElements()
  if (!rail || !toggle) return

  toggle.addEventListener('click', () => {
    const collapsed = rail.classList.contains('is-collapsed')
    toggle.setAttribute('data-typed-shell', 'ready')
    toggle.setAttribute('aria-expanded', String(collapsed))
  })
}

document.addEventListener('DOMContentLoaded', setupTypedClientShell)
