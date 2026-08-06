#!/usr/bin/env node

/**
 * Generate version.json at build time
 * This file is used by the client to detect deployment changes
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Determine the project root directory
// Works from both local dev and Vercel build environments
const buildDir = process.cwd();
const versionFile = path.join(buildDir, 'version.json');

// Ensure version file can be written
if (!fs.existsSync(buildDir)) {
  console.error(`[generate-version] Build directory does not exist: ${buildDir}`);
  process.exit(1);
}

// Generate a build-time hash based on current time and git info if available
let buildHash = crypto.randomBytes(8).toString('hex');
try {
  const { execSync } = require('child_process');
  const gitHash = execSync('git rev-parse --short HEAD', { 
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'ignore']
  }).trim();
  
  let gitDirty = '';
  try {
    gitDirty = execSync('git status --porcelain', { 
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore']
    }).trim();
  } catch {
    // May fail in some build environments, that's ok
  }
  
  buildHash = gitHash + (gitDirty ? '-dirty' : '');
} catch (error) {
  // Git not available, use random hash (common in some CI/CD systems)
  console.warn(`[generate-version] Git info not available, using random hash`);
}

const versionInfo = {
  version: '1.0.0',
  buildTime: new Date().toISOString(),
  buildTimestamp: Date.now(),
  buildHash: buildHash
};

try {
  fs.writeFileSync(versionFile, JSON.stringify(versionInfo, null, 2), 'utf-8');
  console.log(`[generate-version] Created ${versionFile}`);
  console.log(`[generate-version] Version info:`, JSON.stringify(versionInfo, null, 2));
} catch (error) {
  console.error(`[generate-version] Failed to write version file:`, error.message);
  process.exit(1);
}
