import express from 'express';

const app = express();
const handler = () => {};

app.route('/users')
  .get(handler)
  .post(handler);
