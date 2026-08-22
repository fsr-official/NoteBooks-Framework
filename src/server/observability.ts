import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import * as metrics from '../lib/metrics.js';

export function registerObservability(app: express.Application, projectDir: string): void {
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      try {
        metrics.incCounter('requests_total');
        metrics.incCounter(`requests_method_${req.method.toLowerCase()}`, 1);
        metrics.incCounter('request_duration_ms_sum', duration);
        metrics.incCounter('request_duration_ms_count', 1);
        if (res.statusCode >= 500) metrics.incCounter('request_errors_total', 1);
      } catch {
        // Metrics must never interfere with request handling.
      }
    });
    next();
  });

  app.get('/metrics', (req, res) => {
    const format = String(req.query.format || '').toLowerCase();
    if (format === 'prometheus' || req.headers.accept === 'text/plain') {
      const text = metrics.getPrometheusText ? metrics.getPrometheusText() : '';
      res.setHeader('Content-Type', 'text/plain; version=0.0.4');
      return res.status(200).send(text);
    }
    const currentMetrics = metrics.getMetrics();
    res.setHeader('Content-Type', 'application/json');
    return res.status(200).json(currentMetrics);
  });

  const healthHandler = async (_req: express.Request, res: express.Response) => {
    const health: any = { status: 'ok', checks: {} };
    try {
      const db = await import('../lib/db.js');
      if (db.isConfigured()) {
        try {
          await db.query('SELECT 1');
          health.checks.database = { ok: true };
        } catch (error) {
          health.status = 'degraded';
          health.checks.database = { ok: false, error: String(error) };
        }
      } else {
        health.checks.database = { ok: false, reason: 'DATABASE_URL not configured' };
      }
    } catch (error) {
      health.checks.database = { ok: false, error: String(error) };
    }

    try {
      const shared = await import('../api/_shared.js');
      try {
        const octokit = await shared.getOctokit({ allowUnauthenticated: false } as any);
        const apps = (octokit as any).apps;
        if (apps && typeof apps.getAuthenticated === 'function') {
          await apps.getAuthenticated();
        }
        health.checks.github = { ok: true };
      } catch (error) {
        health.status = 'degraded';
        health.checks.github = { ok: false, error: String(error) };
      }
    } catch (error) {
      health.checks.github = { ok: false, error: String(error) };
    }

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(health);
  };

  app.get('/health', healthHandler);
  app.get('/api/health', healthHandler);

  app.get('/api/version', (_req, res) => {
    const versionPath = path.join(projectDir, 'version.json');
    try {
      if (fs.existsSync(versionPath)) {
        const content = fs.readFileSync(versionPath, 'utf-8');
        res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.set('Pragma', 'no-cache');
        res.set('Expires', '0');
        res.set('Content-Type', 'application/json; charset=utf-8');
        res.send(content);
        return;
      }
    } catch (error) {
      console.warn('[version] Failed to read version.json:', error);
    }

    const fallbackVersion = {
      version: '1.0.0',
      buildTime: new Date().toISOString(),
      buildTimestamp: Date.now(),
      buildHash: 'unknown'
    };
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.json(fallbackVersion);
  });
}
