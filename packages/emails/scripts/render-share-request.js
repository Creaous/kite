#!/usr/bin/env node
import fs from 'fs/promises';
import path from 'path';

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function render() {
  const tplPath = path.resolve(__dirname, '..', 'emails', 'share-request.html');
  let tpl = await fs.readFile(tplPath, 'utf8');

  const sample = {
    recipientName: 'Alex',
    title: 'Acme contract files',
    code: 'ABC123',
    message: 'Please upload the signed contract by Friday.',
    requestUrl: 'https://example.com/share/ABC123',
    requesterName: 'Sam Admin',
    requesterEmail: 'sam@example.com',
    year: new Date().getFullYear(),
    logoSrc: 'images/logo.png'
  };

  for (const [k, v] of Object.entries(sample)) {
    const re = new RegExp(`{{\\s*${escapeRegExp(k)}\\s*}}`, 'g');
    tpl = tpl.replace(re, escapeHtml(String(v)));
  }

  tpl = tpl.replace(/{{#if\s+[^}]+}}([\s\S]*?){{\/if}}/g, (_m, inner) => {
    return inner.trim() === '' ? '' : inner;
  });

  console.log(tpl);
}

export default render;
render().catch((e) => {
  console.error(e);
  process.exit(1);
});
