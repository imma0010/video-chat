/** @type {import('next').NextConfig} */
// const fs = require('fs');
// const path = require('path');
import fs from 'fs';
import path from 'path';

const nextConfig = {
    devServer: {
        https: {
            key: fs.readFileSync(path.resolve('localhost.key')),
            cert: fs.readFileSync(path.resolve('localhost.cert'))
        }
    }
};

export default nextConfig;
