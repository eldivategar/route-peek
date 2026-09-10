import express from 'express';
// @ts-expect-error unresolvable import test
import missingRouter from './non-existent-router';

const app = express();
const handler = () => {};

app.use('/api', missingRouter);
app.get('/health', handler);
