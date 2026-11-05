import crypto from 'node:crypto';
import type { Request, Response } from 'express';
import { getRuntimeCatalog, processRuntimeUpdate, type RuntimeUpdateEvent } from '../lib/runtime-catalog.js';
import { invalidateStreamTree } from './system.js';

function timingSafeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, 'utf8');
  const rightBuffer = Buffer.from(right, 'utf8');
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function verifyUpdateSignature(req: Request): boolean {
  const secret = String(process.env.NOTEBOOKS_UPDATE_SECRET || '').trim();
  const rawBody = String((req as Request & { rawBody?: string }).rawBody || '');
  const supplied = String(req.headers['x-notebooks-signature'] || '');
  if (!secret || !rawBody || !/^sha256=[a-f0-9]{64}$/i.test(supplied)) return false;
  const expected = `sha256=${crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')}`;
  return timingSafeEqual(supplied.toLowerCase(), expected);
}

function parseUpdateEvent(value: unknown): RuntimeUpdateEvent | null {
  if (!value || typeof value !== 'object') return null;
  const event = value as Record<string, unknown>;
  if (event.schemaVersion !== 1 || (event.kind !== 'registry' && event.kind !== 'content')) return null;
  if (typeof event.repository !== 'string' || typeof event.branch !== 'string' || typeof event.commitSha !== 'string') return null;
  return {
    schemaVersion: 1,
    kind: event.kind,
    repository: event.repository,
    branch: event.branch,
    commitSha: event.commitSha
  };
}

export async function receiveContentUpdate(req: Request, res: Response) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!verifyUpdateSignature(req)) return res.status(401).json({ error: 'Invalid update signature' });

  const event = parseUpdateEvent(req.body);
  if (!event) return res.status(400).json({ error: 'Invalid content update payload' });

  try {
    const result = await processRuntimeUpdate(event);
    if (!result.superseded && result.changed) {
      const streams = result.streams.filter((stream) => ['science', 'commerce', 'humanities', 'developers'].includes(stream));
      await Promise.all(streams.map((stream) => invalidateStreamTree(stream, true)));
    }
    return res.status(result.superseded ? 202 : 200).json({
      success: true,
      superseded: result.superseded,
      changed: result.changed,
      filesChanged: result.filesChanged,
      catalogVersion: result.version
    });
  } catch (error) {
    console.error('[content-updates] update processing failed:', error instanceof Error ? error.message : error);
    return res.status(503).json({ error: 'Content update could not be processed; retry the workflow notification' });
  }
}

export async function readContentUpdates(req: Request, res: Response) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const sinceRaw = req.query.since === undefined ? '0' : String(req.query.since);
  if (!/^\d+$/.test(sinceRaw)) return res.status(400).json({ error: 'since must be a non-negative catalog version' });
  try {
    const updates = await getRuntimeCatalog(Number(sinceRaw));
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(updates);
  } catch (error) {
    console.error('[content-updates] catalog read failed:', error instanceof Error ? error.message : error);
    return res.status(503).json({ error: 'Content catalog is temporarily unavailable' });
  }
}
