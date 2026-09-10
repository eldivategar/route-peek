import express from 'express';
import userRouter from './routes/users';

const app = express();
app.use('/api/users', userRouter);
