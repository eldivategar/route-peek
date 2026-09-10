import express from 'express';
import apiRouter from './routes/index';
import { requestLogger } from './middleware/auth';

const app = express();

app.use(express.json());
app.use(requestLogger);

app.use('/api', apiRouter);

export default app;
