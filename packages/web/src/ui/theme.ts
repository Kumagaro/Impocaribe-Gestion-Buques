import { tokensCss } from './tokens';

/** Inserta una sola vez las variables CSS de los tokens en el documento (app y Storybook). */
export function installTokens(doc: Document = document): void {
  if (doc.getElementById('impocaribe-tokens')) return;
  const style = doc.createElement('style');
  style.id = 'impocaribe-tokens';
  style.textContent = tokensCss();
  doc.head.prepend(style);
}
