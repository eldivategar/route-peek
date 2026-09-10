import express from 'express';

const app = express();
const router = express.Router();
const handler = () => {};

router.get('/items', handler);
router.post('/items', handler);

app.use('/api', router);
