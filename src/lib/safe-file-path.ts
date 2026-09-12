const PRIVATE_FILE_NAMES = new Set([
  'id_rsa',
  'id_ed25519',
  'credentials.json',
  'service-account.json',
  '.npmrc'
]);

export function isSafePublishedFilePath(value: string): boolean {
  const normalized = String(value || '').replace(/\\/g, '/').replace(/^\/+/, '');
  if (!normalized || normalized.includes('\0')) return false;

  const segments = normalized.split('/');
  if (segments.some((segment) => !segment || segment === '.' || segment === '..' || segment.startsWith('.'))) return false;

  const basename = segments.at(-1)?.toLowerCase() || '';
  if (PRIVATE_FILE_NAMES.has(basename)) return false;
  if (basename.startsWith('.env')) return false;
  if (/\.(?:pem|key|p12|pfx)$/i.test(basename)) return false;

  return true;
}
