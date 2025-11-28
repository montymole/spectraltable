---
description: Git branching workflow for Spectra Table project
---

# Git Workflow

## Branch Strategy

### Main Branch
- `main` - stable, working code only
- Each commit on main should represent a complete, working increment
- Never commit broken code to main

### Feature Branches
- Create from main: `git checkout -b feature/task-name`
- Naming convention: `feature/short-description`
- One feature = one branch
- Small, focused changes

## Workflow Steps

### Starting New Work

1. Ensure main is up to date
```bash
git checkout main
git pull
```

2. Create feature branch
```bash
git checkout -b feature/webgl-context-setup
```

3. Work on the feature, commit frequently
```bash
git add .
git commit -m "implement: WebGL2 context initialization"
```

### Completing a Feature

1. Ensure all changes are committed
```bash
git status
```

2. Switch to main
```bash
git checkout main
```

3. Merge feature branch
```bash
git merge feature/webgl-context-setup --no-ff
```

4. Delete feature branch (optional, cleanup)
```bash
git branch -d feature/webgl-context-setup
```

## Feature Branch Examples

Based on ROADMAP.md phases:

### Phase 0: Bootstrapping
- `feature/vite-setup` - Initial Vite + TypeScript setup

### Phase 1: Core Synthesis Pipeline
- `feature/webgl-context` - WebGL2 context and extension setup
- `feature/spectral-volume` - 3D texture implementation
- `feature/ifft-algorithm` - Inverse FFT implementation
- `feature/audio-worklet` - AudioWorklet processor
- `feature/double-buffer` - CPU-GPU data bridge

### Phase 2: Dynamic Controls + Visualization
- `feature/reading-path` - Path calculation logic
- `feature/ui-controls` - Vanilla DOM controls
- `feature/3d-visualization` - Cube and path rendering
- `feature/spatialization` - Stereo audio processing

### Phase 3: MIDI + Animation
- `feature/web-midi` - MIDI input handling
- `feature/gpu-animation` - Spectral animation shaders
- `feature/optimization` - Performance improvements

## Commit Message Format

```
<type>: <short description>

[optional body]
```

**Types:**
- `implement:` - New feature implementation
- `fix:` - Bug fix
- `refactor:` - Code restructuring without behavior change
- `docs:` - Documentation only
- `test:` - Test additions or fixes
- `perf:` - Performance improvement

**Examples:**
```bash
git commit -m "implement: WebGL2 context with float texture support"
git commit -m "fix: audio worklet underrun on low-end devices"
git commit -m "perf: optimize iFFT using lookup tables"
git commit -m "docs: add API documentation for SpectralVolume class"
```

## Working Branches Lifecycle

1. **Create** from main
2. **Develop** with frequent commits
3. **Test** - ensure it works
4. **Merge** to main (only when working)
5. **Delete** branch (keep repo clean)

## Key Principles

- **Main is sacred** - only merge working code
- **Small branches** - easier to review and merge
- **Commit often** - don't lose work
- **Descriptive names** - `feature/webgl-context` not `feature/stuff`
- **Clean history** - each main commit is a milestone
