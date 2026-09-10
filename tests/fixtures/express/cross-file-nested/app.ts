import express from 'express';
import apiRouter from './routes/api';

const app = express();
app.use('/api', apiRouter);
