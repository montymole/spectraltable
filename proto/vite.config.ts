import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
    base: './',
    server: {
        port: 5000,
        open: true, // Auto-open browser on dev server start
    },
    build: {
        outDir: resolve(__dirname, '../docs'),
        assetsDir: '',
        sourcemap: true,
        target: 'es2020',
    },
});
