import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

function filesUnder(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? filesUnder(full) : [full];
  });
}

test('production source contains no TypeScript files', () => {
  const sourceFiles = [...filesUnder(path.join(root, 'src')), ...filesUnder(path.join(root, 'server'))];
  assert.equal(sourceFiles.some((file) => /\.(ts|tsx|d\.ts)$/.test(file)), false);
});

test('Render service uses the expected build, start and health configuration', () => {
  const blueprint = fs.readFileSync(path.join(root, 'render.yaml'), 'utf8');
  assert.match(blueprint, /buildCommand: npm install --include=dev && npm run build/);
  assert.match(blueprint, /key: NODE_VERSION\n\s+value: 20\.19\.5/);
  assert.match(blueprint, /startCommand: npm start/);
  assert.match(blueprint, /healthCheckPath: \/health/);
});

test('server binds to Render PORT and 0.0.0.0', () => {
  const server = fs.readFileSync(path.join(root, 'server/index.js'), 'utf8');
  assert.match(server, /process\.env\.PORT/);
  assert.match(server, /0\.0\.0\.0/);
});

test('server never exposes the Supabase service role through VITE variables', () => {
  const example = fs.readFileSync(path.join(root, '.env.example'), 'utf8');
  assert.doesNotMatch(example, /VITE_SUPABASE_SERVICE_ROLE_KEY/);
});
