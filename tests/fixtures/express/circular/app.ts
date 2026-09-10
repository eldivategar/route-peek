import express from 'express';

const app = express();
const routerA = express.Router();
const routerB = express.Router();
const handler = () => {};

routerA.use('/b', routerB);
routerB.use('/a', routerA);

app.use('/root', routerA);

routerA.get('/endpointA', handler);
routerB.get('/endpointB', handler);
