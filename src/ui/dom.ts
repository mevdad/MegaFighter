export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  ...children: Array<Node | string>
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  for (const child of children) node.append(child);
  return node;
}

export function button(label: string, className = 'btn', onClick?: () => void): HTMLButtonElement {
  const node = el('button', className, label);
  node.type = 'button';
  if (onClick) {
    // pointerup вместо click: на телефоне click приходит с задержкой ~300 мс.
    node.addEventListener('pointerup', (e) => {
      e.preventDefault();
      onClick();
    });
  }
  return node;
}

export function clear(node: HTMLElement): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}

export function hex(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}
