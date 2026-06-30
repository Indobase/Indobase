#!/usr/bin/env node
/**
 * Guard against passing scalar workbench getters into useStore().
 * That pattern caused production crashes (subscribe.bind on undefined).
 */
import fs from 'node:fs';
import path from 'node:path';

const APP_ROOT = path.resolve(import.meta.dirname, '../app');
const SCALAR_GETTERS = new Set(['filesCount', 'firstArtifact']);

let failed = false;

function checkFile(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  const rel = path.relative(APP_ROOT, filePath);

  for (const match of text.matchAll(/useStore\(\s*workbenchStore\.(\w+)\s*\)/g)) {
    const key = match[1];

    if (SCALAR_GETTERS.has(key)) {
      console.error(`${rel}: useStore(workbenchStore.${key}) must use a nanostore atom, not a scalar getter`);
      failed = true;
    }

    if (key.endsWith('Count') && !key.endsWith('Atom')) {
      console.error(`${rel}: useStore(workbenchStore.${key}) looks like a count getter — expose *CountAtom instead`);
      failed = true;
    }
  }
}

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      walk(fullPath);
      continue;
    }

    if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
      checkFile(fullPath);
    }
  }
}

walk(APP_ROOT);

if (failed) {
  process.exit(1);
}

console.log('nanostore useStore guard: ok');
