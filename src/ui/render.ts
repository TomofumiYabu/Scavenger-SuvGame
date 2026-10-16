import { templates } from "./templates";
import type { ViewContext } from "./templates";

function identity(node: Node): string | undefined {
  if (!(node instanceof HTMLElement)) return undefined;
  return node.id || node.dataset.focus || node.dataset.action;
}

/** Reconcile the fixed shell in place so buttons, dialogs and details survive updates. */
function patch(current: Node, next: Node): void {
  if (current.isEqualNode(next)) return;
  if (current.nodeType !== next.nodeType || current.nodeName !== next.nodeName || identity(current) !== identity(next)) {
    current.parentNode!.replaceChild(next.cloneNode(true), current);
    return;
  }
  if (!(current instanceof Element) || !(next instanceof Element)) {
    current.nodeValue = next.nodeValue;
    return;
  }
  // The player's disclosure state belongs to the live DOM, not each render's default.
  const retained = (name: string) => current instanceof HTMLDetailsElement && name === "open";
  for (const attr of [...current.attributes]) {
    if (!next.hasAttribute(attr.name) && !retained(attr.name)) current.removeAttribute(attr.name);
  }
  for (const attr of next.attributes) {
    if (!retained(attr.name) && current.getAttribute(attr.name) !== attr.value) current.setAttribute(attr.name, attr.value);
  }
  const children = [...current.childNodes];
  [...next.childNodes].forEach((child, index) => {
    if (children[index]) patch(children[index]!, child);
    else current.appendChild(child.cloneNode(true));
  });
  for (const child of children.slice(next.childNodes.length)) child.remove();
}

export function render(game: HTMLElement, context: ViewContext): void {
  const template = document.createElement("template");
  template.innerHTML = templates(context);
  if (!game.childNodes.length) game.append(template.content);
  else {
    [...template.content.childNodes].forEach((node, index) => patch(game.childNodes[index]!, node));
  }
}
