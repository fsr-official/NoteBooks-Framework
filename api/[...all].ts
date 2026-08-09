import createApp from '../src/server/server';

// Create the Express app once and export it as the default handler. Vercel's
// Node builder will adapt this to the serverless function entrypoint.
const app = createApp();

export default app;
