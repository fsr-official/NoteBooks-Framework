const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
let removedCount = 0;

function removeStaleJsFiles(directory) {
  const entries = fs.readdirSync(directory, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      removeStaleJsFiles(fullPath);
      continue;
    }

    if (!entry.name.endsWith('.js')) {
      continue;
    }

    const tsCounterpart = fullPath.slice(0, -3) + '.ts';
    if (fs.existsSync(tsCounterpart)) {
      fs.unlinkSync(fullPath);
      console.log(`removed stale JS artifact: ${path.relative(root, fullPath)}`);
      removedCount += 1;
    }
  }
}

removeStaleJsFiles(path.join(root, 'src'));
console.log(`cleanup complete (${removedCount} stale JS file${removedCount === 1 ? '' : 's'} removed)`);
