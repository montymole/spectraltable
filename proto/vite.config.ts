import { defineConfig } from 'vite';

export default defineConfig({
    base: './',
    server: {
        port: 5000,
        open: true, // Auto-open browser on dev server start
    },
    build: {
        outDir: 'docs',
        assetsDir: '',
        sourcemap: true,
        target: 'es2020',
    },
});
