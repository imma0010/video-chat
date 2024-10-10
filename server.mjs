// const express = require('express');
import express from 'express';
import next from 'next';
import fs from 'fs';
import path from 'path';
import https from 'https';

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = express();

  // Serve static files
  // server.use(express.static(path.join(__dirname, 'public')));

  // Handle all other requests with Next.js
  server.all('*', (req, res) => handle(req, res));

  // HTTPS options
  const options = {
    key: fs.readFileSync(path.resolve('localhost.key')),
    cert: fs.readFileSync(path.resolve('localhost.cert')),
  };

  https.createServer(options, server).listen(3000, () => {
    console.log('> Server listening on https://localhost:3000');
  });
});
