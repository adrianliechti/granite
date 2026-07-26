import { createHighlighter } from '@tanstack/highlight/core';
import { json } from '@tanstack/highlight/languages/json';
import { shell } from '@tanstack/highlight/languages/shell';
import { sql } from '@tanstack/highlight/languages/sql';
import { yaml } from '@tanstack/highlight/languages/yaml';
import { createTanStackMarkdownHighlighter } from '@tanstack/highlight/markdown';
import { createThemeBaseCss, createThemeRule } from '@tanstack/highlight/theme';
import { githubDarkTheme } from '@tanstack/highlight/themes/github-dark';

export const highlighter = createHighlighter({
  languages: [json, shell, sql, yaml],
});

export const highlightMarkdownCode = createTanStackMarkdownHighlighter(highlighter);

// Markdown code blocks keep the always-dark chat styling regardless of the
// app color scheme, so the dark theme is scoped directly to the block.
const themeCss = [
  createThemeRule('pre.tm-code', githubDarkTheme),
  createThemeBaseCss({ codeBlockSelector: 'pre.tm-code' }),
].join('\n\n');

const style = document.createElement('style');
style.textContent = themeCss;
document.head.appendChild(style);
