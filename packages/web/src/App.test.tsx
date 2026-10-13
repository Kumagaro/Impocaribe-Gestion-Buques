import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from './App';

// T003: la pantalla de prueba muestra "Órdenes de Carga" (tasks.md T003).
describe('App', () => {
  it('muestra el título "Órdenes de Carga"', () => {
    render(<App />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Órdenes de Carga');
  });
});
