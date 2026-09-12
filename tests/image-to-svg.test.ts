import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { convertImageToSvg } from '../src/lib/image-to-svg';

describe('image-to-svg diagram asset conversion', () => {
  it('packages raster diagrams in an SVG with transparent near-white pixels and clear metadata', async () => {
    const source = await sharp({
      create: {
        width: 2,
        height: 1,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 }
      }
    }).png().toBuffer();
    const converted = await convertImageToSvg(source, 'cell-diagram.png', 'biology');
    expect(converted.mode).toBe('embedded-raster');
    expect(converted.sourceFormat).toBe('png');
    expect(converted.filename).toBe('cell-diagram.svg');
    expect(converted.svg).toContain('Transparent-background biology diagram');
    expect(converted.svg).toContain('data:image/png;base64,');

    const embedded = Buffer.from(converted.svg.match(/base64,([^\"]+)/)?.[1] || '', 'base64');
    const raw = await sharp(embedded).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    expect(raw.data[3]).toBe(0);
  });

  it('normalizes safe native SVGs as vectors and adds accessibility metadata', async () => {
    const converted = await convertImageToSvg(Buffer.from('<svg viewBox="0 0 10 10"><path d="M0 0h10v10H0z"/></svg>'), 'beaker.svg', 'chemistry');
    expect(converted.mode).toBe('vector');
    expect(converted.svg).toContain('role="img"');
    expect(converted.svg).toContain('<title>beaker diagram</title>');
    expect(converted.svg).toContain('<desc>Transparent-background chemistry diagram uploaded to NoteBooks.</desc>');
  });

  it.each([
    '<svg><script>alert(1)</script></svg>',
    '<svg><foreignObject><div>unsafe</div></foreignObject></svg>',
    '<svg><image href="https://evil.example/a.png"/></svg>',
    '<!DOCTYPE svg [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><svg>&xxe;</svg>'
  ])('rejects unsafe SVG input: %s', async (svg) => {
    await expect(convertImageToSvg(Buffer.from(svg), 'unsafe.svg', 'biology')).rejects.toThrow();
  });

  it('rejects unsupported domains and empty content', async () => {
    await expect(convertImageToSvg(Buffer.alloc(0), 'empty.png', 'biology')).rejects.toThrow('Image content is required');
    await expect(convertImageToSvg(Buffer.from('not an image'), 'bad.png', 'physics' as never)).rejects.toThrow('Diagram domain must be biology or chemistry');
  });
});
