import { defineConfig } from 'vite';

export default defineConfig({
    server: {
        port: 3000,
        open: true, // Auto-open browser on dev server start
    },
    build: {
        outDir: 'dist',
        sourcemap: true,
        target: 'es2020',
    },
});
