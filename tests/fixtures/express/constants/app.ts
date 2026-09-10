import express from 'express';

const app = express();
const handler = () => {};

const prefix = '/api';
const users = '/users';

app.get(prefix + users, handler);

const resource = 'products';
app.get(`/${resource}`, handler);
