import { WebGLContext } from './context';

// Minimal 3D renderer for spectral cube wireframe
// Will be expanded with proper shaders and path rendering later

export class Renderer {
    private ctx: WebGLContext;

    constructor(ctx: WebGLContext) {
        this.ctx = ctx;
    }

    public render(): void {
        // Clear to dark blue-gray (matching concept image)
        this.ctx.clear(0.08, 0.08, 0.12);

        // TODO: Render wireframe cube
        // TODO: Render reading path curve
    }

    public resize(width: number, height: number): void {
        this.ctx.resize(width, height);
    }
}
