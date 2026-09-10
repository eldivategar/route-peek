import express from 'express';

const app = express();
const handler = () => {};

declare function getDynamic(): string;
declare function getRoute(): string;

const prefix = '/api';

app.get(`${prefix}/${getDynamic()}`, handler);
app.post(getRoute(), handler);
