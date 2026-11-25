#!/usr/bin/env node
// Writes every listing icon out as a standalone SVG file.
//
// The browser bundle keeps the artwork inline (no extra requests at runtime):
// SHAPES holds either a 24-grid stroke path list or { viewBox, parts } filled
// artwork. This script loads the bundle with a fake React and dumps the file
// icons into assets/icons/, so the same artwork is browsable in the repo.
//
//   node scripts/export-icons.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const require = createRequire(import.meta.url);

let impl = null;
globalThis.window = {
  __ModuleLoader__: {
    load: ({ factory }) => {
      const React = new Proxy({}, { get: (_, key) => (key === 'Fragment' ? 'Fragment' : function noop() {}) });
      impl = factory(() => React);
    },
  },
};

require(join(root, 'lib/client.js'));
if (!impl || !impl.SHAPES) throw new Error('client bundle did not expose SHAPES');

// shape name -> file name; only the artwork used in the file list
const FILES = {
  folderFilled: 'folder',
  fileText: 'text',
  filePdf: 'pdf',
  fileWord: 'word',
  fileExcel: 'excel',
  filePpt: 'ppt',
  fileArchive: 'archive',
  fileImage: 'image',
  fileAudio: 'audio',
  fileVideo: 'video',
  fileOther: 'other',
  file: 'file-outline',
};

const attr = (name, value) => ' ' + name + '="' + String(value).replace(/"/g, '&quot;') + '"';

function toSvg(artwork) {
  if (Array.isArray(artwork)) {
    const parts = artwork.map((d) => '  <path d="' + d + '"/>');
    return [
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">',
      ...parts,
      '</svg>',
      '',
    ].join('\n');
  }
  const head = [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + artwork.viewBox + '">',
  ];
  const body = (artwork.parts || []).map((part) => {
    let out = '  <path';
    out += attr('d', part.d);
    if (part.fill) out += attr('fill', part.fill);
    else out += ' fill="currentColor"';
    if (part.opacity) out += attr('opacity', part.opacity);
    if (part.fillRule) out += attr('fill-rule', part.fillRule);
    return out + '/>';
  });
  return [...head, ...body, '</svg>', ''].join('\n');
}

const outDir = join(root, 'assets/icons');
mkdirSync(outDir, { recursive: true });

const written = [];
for (const [shape, name] of Object.entries(FILES)) {
  const artwork = impl.SHAPES[shape];
  if (!artwork) throw new Error('missing shape: ' + shape);
  writeFileSync(join(outDir, name + '.svg'), toSvg(artwork));
  written.push(name + '.svg');
}
console.log('wrote ' + written.length + ' icons to assets/icons/: ' + written.join(', '));
