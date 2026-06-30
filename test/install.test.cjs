const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { ensureNode, ensurePnpm, extractArchive } = require('../src/install.cjs');

function tempCache() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-cache-'));
  return {
    root,
    cleanup: () => fs.rmSync(root, { recursive: true, force: true })
  };
}

test('ensureNode downloads and extracts Node.js when the cached executable is missing', async () => {
  const cache = tempCache();
  const events = [];

  try {
    const result = await ensureNode({
      version: '20.19.5',
      cacheRoot: cache.root,
      platform: 'win32',
      arch: 'x64',
      downloadFile: (url, destination) => {
        events.push(['download', url, path.basename(destination)]);
        fs.mkdirSync(path.dirname(destination), { recursive: true });
        fs.writeFileSync(destination, 'archive');
      },
      extractArchive: (archive, destination) => {
        events.push(['extract', path.basename(archive), destination]);
        fs.mkdirSync(path.dirname(resultPath(cache.root)), { recursive: true });
        fs.writeFileSync(resultPath(cache.root), '');
      }
    });

    assert.strictEqual(path.basename(result.executablePath), 'node.exe');
    assert.deepStrictEqual(events[0], [
      'download',
      'https://nodejs.org/dist/v20.19.5/node-v20.19.5-win-x64.zip',
      'node-v20.19.5-win-x64.zip'
    ]);
    assert.strictEqual(events[1][0], 'extract');
  } finally {
    cache.cleanup();
  }
});

test('ensurePnpm downloads and extracts pnpm when the cached CLI is missing', async () => {
  const cache = tempCache();
  const events = [];

  try {
    const result = await ensurePnpm({
      version: '9.15.9',
      cacheRoot: cache.root,
      downloadFile: (url, destination) => {
        events.push(['download', url, path.basename(destination)]);
        fs.mkdirSync(path.dirname(destination), { recursive: true });
        fs.writeFileSync(destination, 'archive');
      },
      extractArchive: (archive, destination) => {
        events.push(['extract', path.basename(archive), destination]);
        fs.mkdirSync(path.dirname(resultPathPnpm(cache.root)), { recursive: true });
        fs.writeFileSync(resultPathPnpm(cache.root), '');
      }
    });

    assert.strictEqual(result.executablePath, resultPathPnpm(cache.root));
    assert.deepStrictEqual(events[0], [
      'download',
      'https://registry.npmjs.org/pnpm/-/pnpm-9.15.9.tgz',
      'pnpm-9.15.9.tgz'
    ]);
    assert.strictEqual(events[1][0], 'extract');
  } finally {
    cache.cleanup();
  }
});

test('extractArchive uses the Windows system tar instead of PATH tar on Windows', () => {
  const cache = tempCache();
  const calls = [];

  try {
    extractArchive('C:\\cache\\archive.zip', cache.root, {
      platform: 'win32',
      env: { SystemRoot: 'C:\\Windows' },
      spawnSync: (command, args, options) => {
        calls.push({ command, args, options });
        return { status: 0 };
      }
    });

    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].command, 'C:\\Windows\\System32\\tar.exe');
    assert.deepStrictEqual(calls[0].args, ['-xf', 'C:\\cache\\archive.zip', '-C', cache.root]);
    assert.strictEqual(calls[0].options.stdio, 'inherit');
  } finally {
    cache.cleanup();
  }
});

function resultPath(cacheRoot) {
  return path.join(cacheRoot, 'node', '20.19.5', 'win32-x64', 'node-v20.19.5-win-x64', 'node.exe');
}

function resultPathPnpm(cacheRoot) {
  return path.join(cacheRoot, 'pnpm', '9.15.9', 'package', 'bin', 'pnpm.cjs');
}
