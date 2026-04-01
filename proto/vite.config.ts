import { defineConfig } from 'vite';

export default defineConfig({
    base: './',
    server: {
        port: 3000,
        open: true, // Auto-open browser on dev server start
    },
    build: {
        outDir: 'docs',
        assetsDir: '',
        sourcemap: true,
        target: 'es2020',
    },
});
