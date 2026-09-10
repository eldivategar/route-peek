// Fake class named Hono without importing from hono
class Hono {
  get(_path: string, _fn: any) {}
}

const app = new Hono();
app.get('/fake-route', () => {});

// Arbitrary object named hono
const hono = {
  post: (_path: string, _fn: any) => {},
};
hono.post('/fake-post', () => {});
