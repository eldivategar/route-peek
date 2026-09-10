const express = require('express');
const userRouter = require('./routes/users');

const app = express();
app.use('/api/users', userRouter);
