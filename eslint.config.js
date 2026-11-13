import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

/** NFR-11: user-visible text comes from the i18n catalogs (src/i18n/catalogs), never from literals. */
const UI_STRING =
  'Hard-coded UI string: put the text in src/i18n/catalogs and use t().';
const TEXT_PROPS =
  '/^(textContent|innerText|innerHTML|outerHTML|title|placeholder|alt|label)$/';
const TEXT_ATTRS =
  '/^(aria-label|aria-description|title|placeholder|alt|label)$/';
const TEXT_CALLS =
  '/^(append|prepend|replaceChildren|createTextNode|insertAdjacentText|insertAdjacentHTML|before|after|replaceWith)$/';
const noHardcodedUiStrings = [
  'error',
  {
    selector: `AssignmentExpression[left.property.name=${TEXT_PROPS}][right.type='Literal'][right.value!='']`,
    message: UI_STRING,
  },
  {
    selector: `AssignmentExpression[left.property.name=${TEXT_PROPS}][right.type='TemplateLiteral']`,
    message: UI_STRING,
  },
  {
    selector: `CallExpression[callee.property.name='setAttribute'][arguments.0.value=${TEXT_ATTRS}][arguments.1.type=/^(Literal|TemplateLiteral)$/]`,
    message: UI_STRING,
  },
  {
    selector: `CallExpression[callee.property.name=${TEXT_CALLS}] > :matches(Literal[value!=''], TemplateLiteral).arguments`,
    message: UI_STRING,
  },
];

export default tseslint.config(
  { ignores: ['dist', 'node_modules'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    files: ['src/**/*.ts'],
    ignores: ['src/**/*.test.ts', 'src/i18n/catalogs/**'],
    rules: { 'no-restricted-syntax': noHardcodedUiStrings },
  },
);
