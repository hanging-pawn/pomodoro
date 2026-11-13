import { APP_NAME } from './config';

export function mountApp(root: HTMLElement): void {
  document.title = APP_NAME;
  const main = document.createElement('main');
  const h1 = document.createElement('h1');
  h1.textContent = APP_NAME;
  main.append(h1);
  root.replaceChildren(main);
}
