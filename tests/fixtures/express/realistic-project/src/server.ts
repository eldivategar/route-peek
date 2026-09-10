import app from './app';

const PORT = 3000;
export function startServer() {
  return app.listen(PORT);
}
