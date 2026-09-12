import type { Request, Response } from 'express';
import { put, del } from '@vercel/blob';
import { convertImageToSvg, type DiagramDomain } from '../lib/image-to-svg.js';

export default async function handler(req: Request, res: Response) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { action, filename, content, url, domain } = req.body || {};

  try {
    if (action === 'convert-svg') {
      if (!filename || !content || !domain) {
        return res.status(400).json({ error: 'Missing filename, content, or diagram domain' });
      }
      const buffer = Buffer.from(content, 'base64');
      const converted = await convertImageToSvg(buffer, String(filename), String(domain) as DiagramDomain);
      return res.status(200).json({
        filename: converted.filename,
        content: Buffer.from(converted.svg, 'utf8').toString('base64'),
        bytes: converted.bytes,
        sourceFormat: converted.sourceFormat,
        mode: converted.mode,
        mime: 'image/svg+xml'
      });
    }

    if (action === 'upload') {
      if (!filename || !content) {
        return res.status(400).json({ error: 'Missing filename or content' });
      }

      const buffer = Buffer.from(content, 'base64');
      if (buffer.byteLength > 25 * 1024 * 1024) {
        return res.status(413).json({ error: 'File exceeds 25 MB limit' });
      }

      const blob = await put(filename, buffer, {
        access: 'private',
        addRandomSuffix: false
      });

      return res.status(200).json({ url: blob.url });
    }

    if (action === 'delete') {
      if (!url) return res.status(400).json({ error: 'Missing url' });
      await del(url);
      return res.status(200).json({ ok: true });
    }

    if (action === 'fetch') {
      if (!url) return res.status(400).json({ error: 'Missing url' });
      const blobRes = await fetch(url, {
        headers: {
          Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN || ''}`
        }
      });

      if (!blobRes.ok) {
        return res.status(blobRes.status).json({ error: `Blob fetch failed: ${blobRes.status}` });
      }

      const buffer = Buffer.from(await blobRes.arrayBuffer());
      return res.status(200).json({ content: buffer.toString('base64') });
    }

    return res.status(400).json({ error: `Unknown action: ${action}` });
  } catch (error: any) {
    console.error('[api/blob]', error);
    return res.status(500).json({ error: error?.message || 'Internal error' });
  }
}