import { mountApp } from './app';
import { createI18n } from './i18n/i18n';

const root = document.getElementById('app');
if (root) mountApp(root, createI18n());
