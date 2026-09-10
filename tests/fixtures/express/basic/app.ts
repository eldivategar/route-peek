import express from 'express';

const app = express();
const handler = () => {};

app.get('/users', handler);
app.post('/users', handler);
app.put('/users/:id', handler);
app.delete('/users/:id', handler);
app.options('/users', handler);
app.head('/users', handler);
