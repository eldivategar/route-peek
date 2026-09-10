#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

console.log('--- Route Peek VSIX Validation ---');

const pkgPath = path.join(rootDir, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const expectedVsixName = `route-peek-${pkg.version}.vsix`;
const vsixPath = path.join(rootDir, expectedVsixName);

const failures = [];

function assert(condition, message) {
  if (!condition) {
    failures.push(message);
    console.error(`❌ FAIL: ${message}`);
  } else {
    console.log(`✅ PASS: ${message}`);
  }
}

// 1. Check VSIX artifact existence and size
assert(fs.existsSync(vsixPath), `VSIX artifact exists at ${expectedVsixName}`);
if (fs.existsSync(vsixPath)) {
  const stat = fs.statSync(vsixPath);
  assert(stat.size > 10000, `VSIX size is reasonable (${(stat.size / 1024 / 1024).toFixed(2)} MB)`);
} else {
  console.error(`Cannot proceed with archive inspection: ${expectedVsixName} not found.`);
  process.exit(1);
}

// 2. Read archive entries via unzip -l
let fileList = [];
try {
  const rawList = execSync(`unzip -l "${vsixPath}"`, { encoding: 'utf8' });
  const lines = rawList.split('\n');
  for (const line of lines) {
    const match = line.trim().match(/^\d+\s+[\d-]+\s+[\d:]+\s+(.+)$/);
    if (match) {
      fileList.push(match[1]);
    }
  }
} catch (err) {
  failures.push(`Failed to read VSIX archive: ${err.message}`);
}

assert(fileList.length > 0, `Archive contains entries (found ${fileList.length} files)`);

// 3. Required runtime entries
const requiredEntries = [
  'extension/package.json',
  'extension/dist/extension.js',
  'extension/readme.md',
  'extension/LICENSE.txt',
  'extension/changelog.md',
  'extension/assets/icon.png',
  'extension.vsixmanifest',
  '[Content_Types].xml',
];

for (const req of requiredEntries) {
  assert(fileList.includes(req), `Required entry present: ${req}`);
}

// 4. Forbidden entries (development artifacts, sources, tests, dotfiles, internal docs)
const forbiddenPrefixes = [
  'extension/src/',
  'extension/tests/',
  'extension/node_modules/',
  'extension/.git',
  'extension/.github',
  'extension/.vscode',
  'extension/coverage/',
];

for (const forbidden of forbiddenPrefixes) {
  const leaks = fileList.filter((f) => f.startsWith(forbidden));
  assert(leaks.length === 0, `No forbidden entries for ${forbidden} (found ${leaks.length})`);
}

const forbiddenSpecific = [
  'extension/AGENTS.md',
  'extension/RULES.md',
  'extension/TASKS.md',
  'extension/PRD.md',
  'extension/tsconfig.json',
  'extension/vitest.config.ts',
  'extension/eslint.config.mjs',
  'extension/.gitignore',
  'extension/.vscodeignore',
];

for (const forbidden of forbiddenSpecific) {
  assert(!fileList.includes(forbidden), `Internal documentation/config excluded: ${forbidden}`);
}

const tsSourceLeaks = fileList.filter((f) => f.endsWith('.ts') && !f.endsWith('.d.ts'));
assert(tsSourceLeaks.length === 0, `No raw TypeScript sources present in package (found ${tsSourceLeaks.length})`);

// 5. Verify package.json metadata
assert(pkg.name === 'route-peek', `package.json "name" is "route-peek"`);
assert(pkg.displayName === 'Route Peek', `package.json "displayName" is "Route Peek"`);
assert(pkg.publisher === 'eldivategar', `package.json "publisher" is "eldivategar"`);
assert(pkg.version === '0.1.0', `package.json "version" is "0.1.0"`);
assert(pkg.icon === 'assets/icon.png', `package.json "icon" points to "assets/icon.png"`);
assert(pkg.main === './dist/extension.js', `package.json "main" is "./dist/extension.js"`);
assert(pkg.license === 'MIT', `package.json "license" is "MIT"`);
assert(Array.isArray(pkg.categories) && pkg.categories.length > 0, `package.json categories defined`);
assert(Array.isArray(pkg.keywords) && pkg.keywords.length >= 5, `package.json keywords defined (at least 5)`);
assert(pkg.repository?.url?.includes('route-peek'), `package.json repository configured`);
assert(pkg.homepage?.includes('route-peek'), `package.json homepage configured`);
assert(pkg.bugs?.url?.includes('route-peek'), `package.json bugs url configured`);

// 6. Verify dist/extension.js syntax
try {
  execSync(`node --check "${path.join(rootDir, 'dist/extension.js')}"`);
  assert(true, `dist/extension.js passes Node.js syntax check`);
} catch (err) {
  assert(false, `dist/extension.js syntax check failed: ${err.message}`);
}

// 7. Verify icon file
const iconPath = path.join(rootDir, 'assets/icon.png');
assert(fs.existsSync(iconPath), `assets/icon.png exists`);
if (fs.existsSync(iconPath)) {
  const iconStat = fs.statSync(iconPath);
  assert(iconStat.size > 0 && iconStat.size < 500000, `assets/icon.png size is valid (${iconStat.size} bytes)`);
}

// Summary
console.log('\n-----------------------------------');
if (failures.length > 0) {
  console.error(`❌ Validation failed with ${failures.length} errors:`);
  for (const f of failures) {
    console.error(`  - ${f}`);
  }
  process.exit(1);
} else {
  console.log(`🎉 ALL VSIX VALIDATION CHECKS PASSED! ${expectedVsixName} is release-ready.`);
  process.exit(0);
}
