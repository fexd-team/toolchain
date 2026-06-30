const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');
const childProcess = require('child_process');
const { getNodeDistribution, getPnpmDistribution } = require('./distributions.cjs');
const { getNodePaths, getPnpmPaths } = require('./cache.cjs');

async function ensureNode(options) {
  const opts = options || {};
  const distribution = getNodeDistribution({
    version: opts.version,
    platform: opts.platform,
    arch: opts.arch
  });
  const paths = getNodePaths(opts.cacheRoot, distribution);

  if (fs.existsSync(paths.executablePath)) {
    return {
      distribution,
      executablePath: paths.executablePath,
      installDir: paths.installDir,
      reused: true
    };
  }

  const download = opts.downloadFile || downloadFile;
  const extract = opts.extractArchive || extractArchive;
  const archivePath = path.join(opts.cacheRoot, 'downloads', distribution.fileName);

  fs.mkdirSync(path.dirname(archivePath), { recursive: true });
  fs.mkdirSync(path.dirname(paths.installDir), { recursive: true });

  await download(distribution.url, archivePath);
  await extract(archivePath, path.dirname(paths.installDir));

  if (!fs.existsSync(paths.executablePath)) {
    throw new Error('Node.js install did not produce expected executable: ' + paths.executablePath);
  }

  return {
    distribution,
    executablePath: paths.executablePath,
    installDir: paths.installDir,
    reused: false
  };
}

async function ensurePnpm(options) {
  const opts = options || {};
  const distribution = getPnpmDistribution(opts.version);
  const paths = getPnpmPaths(opts.cacheRoot, distribution.version);

  if (fs.existsSync(paths.executablePath)) {
    return {
      distribution,
      executablePath: paths.executablePath,
      installDir: paths.installDir,
      reused: true
    };
  }

  const download = opts.downloadFile || downloadFile;
  const extract = opts.extractArchive || extractArchive;
  const archivePath = path.join(opts.cacheRoot, 'downloads', distribution.fileName);

  fs.mkdirSync(path.dirname(archivePath), { recursive: true });
  fs.mkdirSync(paths.installDir, { recursive: true });

  await download(distribution.url, archivePath);
  await extract(archivePath, paths.installDir);

  if (!fs.existsSync(paths.executablePath)) {
    throw new Error('pnpm install did not produce expected CLI: ' + paths.executablePath);
  }

  return {
    distribution,
    executablePath: paths.executablePath,
    installDir: paths.installDir,
    reused: false
  };
}

function downloadFile(url, destination) {
  const client = url.startsWith('https:') ? https : http;

  return new Promise((resolve, reject) => {
    const request = client.get(url, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume();
        downloadFile(response.headers.location, destination).then(resolve, reject);
        return;
      }

      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error('Download failed with HTTP ' + response.statusCode + ': ' + url));
        return;
      }

      fs.mkdirSync(path.dirname(destination), { recursive: true });
      const stream = fs.createWriteStream(destination);
      response.pipe(stream);
      stream.on('finish', () => stream.close(resolve));
      stream.on('error', reject);
    });

    request.on('error', reject);
  });
}

function extractArchive(archivePath, destination, options) {
  const opts = options || {};
  fs.mkdirSync(destination, { recursive: true });

  const spawn = opts.spawnSync || childProcess.spawnSync;
  const result = spawn(getTarCommand(opts), ['-xf', archivePath, '-C', destination], {
    stdio: 'inherit'
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error('Failed to extract archive: ' + archivePath);
  }
}

function getTarCommand(options) {
  const opts = options || {};
  const platform = opts.platform || process.platform;

  if (platform !== 'win32') {
    return 'tar';
  }

  const env = opts.env || process.env;
  const systemRoot = env.SystemRoot || env.SYSTEMROOT || 'C:\\Windows';
  return path.win32.join(systemRoot, 'System32', 'tar.exe');
}

module.exports = {
  ensureNode,
  ensurePnpm,
  downloadFile,
  extractArchive,
  getTarCommand
};
