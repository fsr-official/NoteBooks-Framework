import express from 'express';
import path from 'node:path';

const STREAM_ROUTES = ['science', 'commerce', 'humanities'] as const;
const PORTAL_ROUTES = ['community', 'volunteers', 'accounts', 'issues', 'about'] as const;

function setAssetContentType(res: express.Response, filePath: string): void {
  if (/\.(?:css|js|png|jpg|jpeg|gif|svg|webp|woff|woff2|ttf)$/.test(filePath)) {
    res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
  }
  if (filePath.endsWith('.css')) {
    res.setHeader('Content-Type', 'text/css; charset=utf-8');
  } else if (filePath.endsWith('.js')) {
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  } else if (filePath.endsWith('.woff') || filePath.endsWith('.woff2')) {
    res.setHeader('Content-Type', 'font/woff2');
  } else if (filePath.endsWith('.ttf')) {
    res.setHeader('Content-Type', 'font/ttf');
  } else if (filePath.endsWith('.gz')) {
    res.setHeader('Content-Type', 'application/gzip');
  }
}

export function registerPublicRoutes(app: express.Application, projectDir: string): void {
  app.get('/', (_req, res) => {
    res.sendFile(path.join(projectDir, 'index.html'));
  });

  app.get('/index.html', (_req, res) => {
    res.sendFile(path.join(projectDir, 'index.html'));
  });

  app.get('/README.md', (_req, res) => {
    res.sendFile(path.join(projectDir, 'README.md'));
  });

  app.get('/LICENSE', (_req, res) => {
    res.sendFile(path.join(projectDir, 'LICENSE'));
  });

  const dashboardShell = (_req: express.Request, res: express.Response) => {
    res.redirect(302, '/settings#personal-space');
  };
  app.get('/dashboard', dashboardShell);
  app.get('/dashboard/', dashboardShell);

  const adminShell = (_req: express.Request, res: express.Response) => {
    res.sendFile(path.join(projectDir, 'public', 'html', 'admin.html'));
  };
  app.get('/admin', adminShell);
  app.get('/admin/', adminShell);

  const legacyAdminShell = (_req: express.Request, res: express.Response) => {
    res.sendFile(path.join(projectDir, 'public', 'html', 'admin-prs.html'));
  };
  app.get('/admin-prs', legacyAdminShell);
  app.get('/admin-prs/', legacyAdminShell);

  const settingsShell = (_req: express.Request, res: express.Response) => {
    res.sendFile(path.join(projectDir, 'public', 'html', 'settings.html'));
  };
  app.get('/settings', settingsShell);
  app.get('/settings/', settingsShell);

  STREAM_ROUTES.forEach((stream) => {
    app.get(`/${stream}`, (_req, res) => res.sendFile(path.join(projectDir, 'public', 'html', 'streams.html')));
    app.get(`/${stream}/{*splat}`, (_req, res) => res.sendFile(path.join(projectDir, 'public', 'html', 'streams.html')));
  });
  PORTAL_ROUTES.forEach((route) => {
    app.get(`/${route}`, (_req, res) => res.sendFile(path.join(projectDir, 'public', 'html', 'portal.html')));
    app.get(`/${route}/{*splat}`, (_req, res) => res.sendFile(path.join(projectDir, 'public', 'html', 'portal.html')));
  });

  app.get('/manifest.json', (_req, res) => {
    res.sendFile(path.join(projectDir, 'public', 'manifest.json'));
  });

  app.get('/service-worker.js', (_req, res) => {
    res.sendFile(path.join(projectDir, 'service-worker.js'));
  });

  app.get('/favicon.png', (_req, res) => {
    res.sendFile(path.join(projectDir, 'favicon.png'));
  });

  const publicDirectory = path.join(projectDir, 'public');
  app.use('/public', express.static(publicDirectory, { setHeaders: setAssetContentType }));
  app.use(express.static(publicDirectory, { setHeaders: setAssetContentType }));
}
