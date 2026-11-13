import { describe, expect, it } from 'vitest';
import { mountApp } from './app';
import { APP_NAME } from './config';

describe('mountApp', () => {
  it('renders the start page with the product name as heading', () => {
    const root = document.createElement('div');
    mountApp(root);
    expect(root.querySelector('h1')?.textContent).toBe('pomo.pomo');
  });

  it('sets the document title to the product name', () => {
    mountApp(document.createElement('div'));
    expect(document.title).toBe(APP_NAME);
  });
});
