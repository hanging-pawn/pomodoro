// @vitest-environment node
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const eslint = new ESLint();

async function uiStringErrors(code: string, filePath = 'src/views/sample.ts') {
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? []).filter(
    (m) => m.ruleId === 'no-restricted-syntax',
  );
}

describe('lint rule: no hard-coded UI strings', () => {
  it.each([
    ["el.textContent = 'Start';"],
    ['el.textContent = `Start ${n}`;'],
    ["el.innerHTML = '<b>Start</b>';"],
    ["input.placeholder = 'Title';"],
    ["el.title = 'Abort';"],
    ["el.setAttribute('aria-label', 'Abort');"],
    ["el.append('Start');"],
    ["document.createTextNode('Start');"],
  ])('flags %s', async (code) => {
    expect(
      await uiStringErrors(
        `declare const el: HTMLElement, input: HTMLInputElement, n: number;\n${code}\n`,
      ),
    ).toHaveLength(1);
  });

  it.each([
    ["el.textContent = t('app.tagline');"],
    ["el.textContent = '';"],
    ["el.setAttribute('data-id', 'x');"],
    ['el.append(child);'],
  ])('allows %s', async (code) => {
    expect(
      await uiStringErrors(
        `declare const el: HTMLElement, child: Node, t: (k: string) => string;\n${code}\n`,
      ),
    ).toHaveLength(0);
  });

  it('does not apply to catalogs and tests', async () => {
    const code = "declare const el: HTMLElement;\nel.textContent = 'Start';\n";
    expect(await uiStringErrors(code, 'src/i18n/catalogs/en.ts')).toHaveLength(
      0,
    );
    expect(await uiStringErrors(code, 'src/views/sample.test.ts')).toHaveLength(
      0,
    );
  });

  it('the source tree has no hard-coded UI strings', async () => {
    const results = await eslint.lintFiles(['src']);
    const offenders = results.flatMap((r) =>
      r.messages
        .filter((m) => m.ruleId === 'no-restricted-syntax')
        .map((m) => `${r.filePath}:${m.line}`),
    );
    expect(offenders).toEqual([]);
  });
});
