import express, { type Request } from 'express';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import path from 'path';
import fs from 'fs';
import { registerWorkspaceRoutes } from './workspace-routes.js';
import { registerPublicRoutes } from './public-routes.js';
import { registerObservability } from './observability.js';
import { registerApiRoutes } from './api-routes.js';
import { applyDevelopmentDefaults, prepareGeneratedArtifacts } from './startup.js';
import { browserSessionMiddleware } from '../lib/browser-session.js';

const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;

export function createApp() {
    // Do not fail the entire serverless function during module initialization when
  // optional/public endpoints are requested. Sensitive operations validate their
  // own required configuration when they are invoked.



  const app = express();
  app.use(compression());

  // TikZJax and other WASM/WebWorker features require the page and its assets to be
  // cross-origin isolated. Setting this at the app layer guarantees the document and
  // static assets inherit the required COOP/COEP policies regardless of route type.
  app.use((_req, res, next) => {
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
    next();
  });

  // Parse cookies so `req.cookies` is available for CSRF, theme endpoints, etc.
  app.use(cookieParser());
  // Every browser receives an opaque state cookie. It is not an authentication credential.
  app.use(browserSessionMiddleware);

  // Protect browser-cookie API mutations by default in production. Set
  // ENFORCE_CSRF=false only for a deliberately isolated compatibility environment.
  const isProduction = process.env.NODE_ENV === 'production' || process.env.VERCEL === '1';
  const enforceCsrf = process.env.ENFORCE_CSRF === 'true' || (isProduction && process.env.ENFORCE_CSRF !== 'false');
  if (enforceCsrf) {
    app.use((req, res, next) => {
      const method = req.method.toUpperCase();
      if (['GET', 'HEAD', 'OPTIONS'].includes(method) || !req.path.startsWith('/api/')) return next();
      // Bearer tokens are not automatically attached by cross-site forms. Signed
      // webhooks and server-to-server refresh routes have their own verification.
      const hasBearer = /^Bearer\s+/i.test(String(req.headers.authorization || ''));
      const serverToServer = req.path === '/api/refresh-signal'
        || req.path.startsWith('/api/system/')
        || req.path === '/api/workspace/tree/rebuild'
        || req.path.startsWith('/api/webhooks/');
      if (hasBearer || serverToServer) return next();
      const cookieToken = String(req.cookies?.csrf || req.headers['x-csrf-cookie'] || '');
      const header = String(req.headers['x-csrf-token'] || '');
      if (!cookieToken || !header || header !== cookieToken) {
        return res.status(403).json({ error: 'CSRF token missing or invalid' });
      }
      return next();
    });
  }

  // Write-path request logging when enabled
  if (process.env.ENABLE_WRITE_LOGS === 'true') {
    app.use((req, _res, next) => {
      const method = req.method.toUpperCase();
      if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
        console.log('[write-log]', method, req.path, req.ip);
      }
      next();
    });
  }
  const projectDir = path.resolve(process.cwd());

  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          'blob:',
          'https://cdn.jsdelivr.net',
          'https://cdnjs.cloudflare.com',
          'https://www.google.com',
          'https://www.gstatic.com',
          'https://va.vercel-scripts.com'
        ],
        scriptSrcAttr: ["'unsafe-inline'"],
        scriptSrcElem: [
          "'self'",
          "'unsafe-inline'",
          'blob:',
          'https://cdn.jsdelivr.net',
          'https://cdnjs.cloudflare.com',
          'https://www.google.com',
          'https://www.gstatic.com',
          'https://va.vercel-scripts.com'
        ],
        workerSrc: ["'self'", 'blob:'],
        connectSrc: [
          "'self'",
          'https://*.github.io',
          'https://cdn.jsdelivr.net',
          'https://raw.githubusercontent.com',
          'https://www.google.com',
          'https://www.gstatic.com',
          'https://cdnjs.cloudflare.com',
          'https://va.vercel-scripts.com'
        ],
        imgSrc: ["'self'", 'data:', 'blob:', 'https://*.github.io', 'https://raw.githubusercontent.com'],
        mediaSrc: ["'self'", 'blob:', 'https://*.github.io', 'https://raw.githubusercontent.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        frameSrc: ["'self'", 'https://docs.google.com', 'https://*.github.io', 'https://www.google.com'],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net', 'https://cdnjs.cloudflare.com', 'https://www.google.com', 'https://fonts.googleapis.com']
      }
    }
  }));
  app.use(express.json({
    limit: '25mb',
    verify: (req, _res, buf) => {
      (req as any).rawBody = buf?.toString('utf8') || '';
    }
  }));
  app.use((error: any, req: Request, res: express.Response, next: express.NextFunction) => {
    if (req.path.startsWith('/api/') && error instanceof SyntaxError && 'body' in error) {
      return res.status(400).json({ error: 'Malformed JSON request body' });
    }
    return next(error);
  });
  registerObservability(app, projectDir);
  app.use(express.urlencoded({ extended: true }));

  registerApiRoutes(app);
  registerPublicRoutes(app, projectDir);
  registerWorkspaceRoutes(app, projectDir);

  return app;
}

export async function startServer(port: number = PORT) {
  applyDevelopmentDefaults();
  const projectDir = path.resolve(process.cwd());
  await prepareGeneratedArtifacts(projectDir);

  const app = createApp();
  return app.listen(port, () => {
    console.log(`Private backend listening on port ${port}`);
  });
}

if (require.main === module) {
  startServer().catch((error) => {
    console.error('[startup] failed to start server:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}

export default createApp;
