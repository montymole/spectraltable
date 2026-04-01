/**
 * Vite client type declarations
 * Allows importing worklet files with ?worker&url suffix
 */

declare module '*?worker&url' {
    const workerUrl: string;
    export default workerUrl;
}

declare module '*?worker' {
    const WorkerFactory: new () => Worker;
    export default WorkerFactory;
}
