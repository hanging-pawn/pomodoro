import { describe, expect, it } from 'vitest';
import { mountApp } from './app';

describe('mountApp', () => {
  it('renders the start page with the app name as heading', () => {
    const root = document.createElement('div');
    mountApp(root);
    expect(root.querySelector('h1')?.textContent).toBe('Pomodoro');
  });
});
