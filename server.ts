import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import { seedDatabaseIfEmpty } from './server/seed.ts';
import { apiRouter } from './server/routes.ts';
import { syncAllReportsToSupabase } from './server/supabaseSync.ts';

async function startServer() {
  seedDatabaseIfEmpty();
  void syncAllReportsToSupabase().catch(() => {});

  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '15mb' }));
  app.use('/api', apiRouter);

  if (process.env.NODE_ENV === 'production') {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`University Attendance ERP server listening on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start University Attendance ERP server:', err);
  process.exit(1);
});
