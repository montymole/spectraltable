# Building and Running Spectra Table

## Prerequisites

- **Node.js** 18.x or later
- **npm** 9.x or later
- A modern browser with WebGL2 support (Chrome, Firefox, Edge, Safari 15+)

## Getting Started

### 1. Install Dependencies

```bash
npm install
```

This installs:
- `vite` - Development server and build tool
- `typescript` - Type checking

### 2. Run Development Server

```bash
npm run dev
```

This will:
- Start Vite dev server on http://localhost:3000
- Automatically open your browser
- Enable hot module replacement (changes reload instantly)

### 3. Build for Production

```bash
npm run build
```

This will:
- Type-check all TypeScript files
- Bundle and minify code
- Output to `dist/` folder
- Generate source maps for debugging

### 4. Preview Production Build

```bash
npm run preview
```

This serves the `dist/` folder locally to test the production build.

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server with HMR |
| `npm run build` | Build for production (outputs to dist/) |
| `npm run preview` | Preview production build locally |
| `npm run typecheck` | Run TypeScript type checking without building |

## Project Structure

```
spectraltable/
├── src/              # Source code (TypeScript)
│   ├── main.ts       # Entry point
│   └── style.css     # Global styles
├── dist/             # Production build output (generated)
├── index.html        # HTML entry point
├── vite.config.ts    # Vite configuration
├── tsconfig.json     # TypeScript configuration
└── package.json      # Dependencies and scripts
```

## Browser Requirements

This application requires:
- **WebGL 2.0** - For GPU compute and 3D rendering
- **Web Audio API** - For audio synthesis
- **Web MIDI API** - For MIDI controller input (optional)

### Compatibility

| Browser | Minimum Version |
|---------|----------------|
| Chrome | 56+ |
| Firefox | 51+ |
| Safari | 15+ |
| Edge | 79+ |

## Development Workflow

1. Make changes in `src/`
2. Browser auto-reloads via HMR
3. Check console for errors
4. Use browser DevTools for debugging

## Troubleshooting

### WebGL2 Not Supported

If you see "WebGL2 not supported" error:
- Update your browser to the latest version
- Check if hardware acceleration is enabled
- Try a different browser

### Port Already in Use

If port 3000 is busy, Vite will automatically try the next available port.

### Module Not Found

Run `npm install` to ensure all dependencies are installed.

## Next Steps

See [ROADMAP.md](./ROADMAP.md) for the implementation plan.
