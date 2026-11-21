/**
 * Startup state shared between server.js and the app.
 * `ready` defaults to true so tests / embedding createApp() work; server.js sets it to false
 * while the database check and first-run bootstrap are still running.
 */
export const state = { ready: true, error: null };
