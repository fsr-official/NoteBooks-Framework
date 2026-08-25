import sharp from 'sharp';

export type DiagramDomain = 'biology' | 'chemistry';

const MAX_INPUT_BYTES = 25 * 1024 * 1024;
const MAX_PIXELS = 40_000_000;
const WHITE_THRESHOLD = 245;
const ALLOWED_RASTER_FORMATS = new Set(['png', 'jpeg', 'jpg', 'webp', 'gif', 'avif', 'tiff']);

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function safeFilename(filename: string, fallback: string): string {
  const basename = String(filename || '').split(/[\\\\/]/).pop() || fallback;
  const cleaned = basename.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/^\.+$/, '');
  return cleaned || fallback;
}

function safeTitle(filename: string, domain: DiagramDomain): string {
  const base = filename.replace(/\.[^.]+$/, '').replace(/[._-]+/g, ' ').trim();
  return `${base || domain} diagram`;
}

function assertSafeSvg(svg: string): void {
  if (!/^\s*<svg\b/i.test(svg)) throw new Error('Uploaded SVG must begin with an <svg> element');
  if (/<\s*script\b/i.test(svg) || /\bon[a-z]+\s*=/i.test(svg) || /(?:javascript|data:text\/html)\s*:/i.test(svg)) {
    throw new Error('SVG contains active content that is not allowed');
  }
  if (/<(?:foreignObject|iframe|object|embed)\b/i.test(svg)) {
    throw new Error('SVG contains embedded content that is not allowed');
  }
  if (/<!(?:DOCTYPE|ENTITY)\b|<\?xml-stylesheet\b/i.test(svg)) {
    throw new Error('SVG contains unsafe XML declarations');
  }
  if (/\b(?:href|xlink:href)\s*=\s*["']\s*(?:https?:|\/\/|file:|javascript:|data:)/i.test(svg)) {
    throw new Error('SVG contains an unsafe external or data link');
  }
}

function normalizeSvg(svg: string, filename: string, domain: DiagramDomain): string {
  assertSafeSvg(svg);
  const title = escapeXml(safeTitle(filename, domain));
  const description = escapeXml(`Transparent-background ${domain} diagram uploaded to NoteBooks.`);
  let output = svg.trim();
  if (!/\sxmlns\s*=/.test(output.slice(0, output.indexOf('>') + 1))) {
    output = output.replace(/^\s*<svg\b/i, '<svg xmlns="http://www.w3.org/2000/svg"');
  }
  const openingEnd = output.indexOf('>');
  const opening = output.slice(0, openingEnd);
  const rest = output.slice(openingEnd);
  const cleanedOpening = /\brole\s*=/.test(opening) ? opening : `${opening} role="img"`;
  const withLabel = /\baria-label(?:ledby)?\s*=/.test(cleanedOpening)
    ? cleanedOpening
    : `${cleanedOpening} aria-label="${title}"`;
  const hasTitle = /<title\b/i.test(output);
  const hasDesc = /<desc\b/i.test(output);
  return `${withLabel}${hasTitle ? '' : `<title>${title}</title>`}${hasDesc ? '' : `<desc>${description}</desc>`}${rest}`;
}

function makeEmbeddedRasterSvg(png: Buffer, width: number, height: number, filename: string, domain: DiagramDomain): string {
  const title = escapeXml(safeTitle(filename, domain));
  const description = escapeXml(`Transparent-background ${domain} diagram converted from an uploaded raster image.`);
  const dataUri = `data:image/png;base64,${png.toString('base64')}`;
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="diagram-title diagram-desc">`,
    `<title id="diagram-title">${title}</title>`,
    `<desc id="diagram-desc">${description}</desc>`,
    `<image width="${width}" height="${height}" preserveAspectRatio="xMidYMid meet" href="${dataUri}"/>`,
    '</svg>'
  ].join('');
}

async function transparentPng(input: Buffer): Promise<{ png: Buffer; width: number; height: number }> {
  const prepared = await sharp(input, { limitInputPixels: MAX_PIXELS }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { data, info } = prepared;
  for (let index = 0; index < data.length; index += info.channels) {
    const red = data[index];
    const green = data[index + 1];
    const blue = data[index + 2];
    const alphaIndex = index + info.channels - 1;
    if (red >= WHITE_THRESHOLD && green >= WHITE_THRESHOLD && blue >= WHITE_THRESHOLD) {
      data[alphaIndex] = 0;
    }
  }
  const png = await sharp(data, { raw: info }).png({ compressionLevel: 9 }).toBuffer();
  return { png, width: info.width, height: info.height };
}

export async function convertImageToSvg(input: Buffer, filename: string, domain: DiagramDomain): Promise<{ svg: string; filename: string; bytes: number; sourceFormat: string; mode: 'vector' | 'embedded-raster' }> {
  if (!Buffer.isBuffer(input) || input.length === 0) throw new Error('Image content is required');
  if (input.byteLength > MAX_INPUT_BYTES) throw new Error('Image exceeds the 25 MB limit');
  if (!['biology', 'chemistry'].includes(domain)) throw new Error('Diagram domain must be biology or chemistry');

  const normalizedFilename = safeFilename(filename, `${domain}-diagram`);
  const lowerName = normalizedFilename.toLowerCase();
  if (lowerName.endsWith('.svg')) {
    const svg = normalizeSvg(input.toString('utf8'), normalizedFilename, domain);
    return { svg, filename: normalizedFilename.replace(/\.svg$/i, '') + '.svg', bytes: Buffer.byteLength(svg), sourceFormat: 'svg', mode: 'vector' };
  }

  const metadata = await sharp(input, { limitInputPixels: MAX_PIXELS }).metadata();
  const format = String(metadata.format || '').toLowerCase();
  if (!ALLOWED_RASTER_FORMATS.has(format)) throw new Error('Only SVG, PNG, JPEG, WebP, GIF, AVIF, TIFF images are supported');
  const raster = await transparentPng(input);
  const svg = makeEmbeddedRasterSvg(raster.png, raster.width, raster.height, normalizedFilename, domain);
  return { svg, filename: normalizedFilename.replace(/\.[^.]+$/, '') + '.svg', bytes: Buffer.byteLength(svg), sourceFormat: format, mode: 'embedded-raster' };
}
