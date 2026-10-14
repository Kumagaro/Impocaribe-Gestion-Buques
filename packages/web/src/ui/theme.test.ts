import { describe, expect, it } from 'vitest';
import { installTokens } from './theme';
import { tokensCss } from './tokens';

// T018: las variables de los tokens se insertan una sola vez en el documento.
describe('installTokens', () => {
  it('inserta las variables CSS una sola vez aunque se llame varias veces', () => {
    const doc = document.implementation.createHTMLDocument('prueba');
    installTokens(doc);
    installTokens(doc);
    const styles = doc.querySelectorAll('style#impocaribe-tokens');
    expect(styles).toHaveLength(1);
    expect(styles[0]!.textContent).toBe(tokensCss());
  });
});
