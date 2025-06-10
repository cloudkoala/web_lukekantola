# Gaussian Splat Showcase - Claude Development History

## Project Overview
A Three.js-based point cloud viewer built specifically for showcasing Gaussian splat models. Originally started with gsplat.js but migrated to Three.js for better camera control and animation capabilities.

## Key Features
- **Point Cloud Rendering**: Displays PLY files with automatic scaling and centering
- **Advanced Camera System**: Quaternion-based animations with smooth interpolation
- **Orbital Controls**: Automated orbital camera movement around selected points
- **Loading Animation**: 5-second cinematic intro sequence on every page load
- **Camera Presets**: Save/load custom camera positions (Top, Front, Side views)
- **Real-time Controls**: Adjustable point size, rotation speed, and interaction modes
- **Retro UI**: Terminal-style interface with Space Mono font and collapsible controls

## Technical Architecture

### Core Technologies
- **Three.js**: 3D rendering engine
- **TypeScript**: Type-safe development
- **Vite**: Build tool and dev server
- **PLYLoader**: Point cloud file loading

### Key Classes
- `OrbitalCameraSystem`: Manages camera animations, presets, and orbital movement
- `OrbitControls`: Three.js camera controls for free navigation
- `PLYLoader`: Handles loading of point cloud files

## Current Configuration

### Default Settings
- **Point Size**: 0.001
- **Camera Start**: (1.03, 2.83, 6.08)
- **Camera End**: (-0.13, 2.81, 1.53)
- **Target**: (0.08, 0.80, -0.21)
- **Animation Duration**: 5 seconds
- **Model**: Castleton_001.ply (user's custom point cloud)

### UI Layout
- **Header**: Terminal-style title "./kantola/luke" with navigation (/projects, /about, /contact)
- **Controls**: Collapsible panel at bottom (starts minimized)
- **Font**: Space Mono for retro monospace aesthetic

## Development History

### Phase 1: Initial Setup (gsplat.js)
- Started with gsplat.js library for Gaussian splat rendering
- Basic cursor interaction attempts
- Hit technical limitations with WebGL buffer management

### Phase 2: Migration to Three.js
- Switched to Three.js for better camera control
- Implemented PLYLoader for point cloud files
- Added basic orbital camera system

### Phase 3: Camera Animation System
- Implemented quaternion-based animations to avoid gimbal lock
- Added smooth SLERP interpolation for camera rotations
- Fixed animation timing issues with sine-based easing

### Phase 4: Loading Animation
- 5-second cinematic intro sequence
- Consistent animation regardless of file caching
- Automatic fallback to demo point cloud if PLY fails

### Phase 5: UI/UX Polish
- Retro terminal aesthetic with Space Mono font
- Collapsible controls panel
- Camera preset save/load system
- localStorage persistence for user preferences

### Phase 6: Final Refinements
- Updated navigation text to terminal-style paths
- Minimized controls panel by default
- Removed glow effects from title
- Fine-tuned font sizes and spacing

## File Structure
```
gsplat-showcase/
├── index.html              # Main HTML structure
├── src/
│   ├── main.ts             # Core application logic
│   ├── style.css           # UI styling and layout
│   └── counter.ts          # Unused Vite template file
├── package.json            # Dependencies and scripts
├── Castleton_001.ply       # User's point cloud model
└── CLAUDE.md              # This development history
```

## Key Solved Issues

### Technical Challenges
1. **gsplat.js WebGL Errors**: GL_INVALID_OPERATION buffer errors → Migrated to Three.js
2. **Gimbal Lock**: Camera flipping during animations → Quaternion-based interpolation
3. **Animation Timing**: Jerky movements and time skipping → Sine-based easing function
4. **Click Detection**: Sudden view shifts on canvas clicks → Mode-based target updates
5. **Loading Animation**: Only worked on first load → Moved trigger to system initialization

### Performance Optimizations
- Auto-scaling for large point clouds (>50 units → scaled to 20 units max)
- Efficient quaternion interpolation with shortest path calculation
- Optimized render loop with proper animation state management

## Commands to Remember
- **Development**: `npm run dev`
- **Build**: `npm run build`
- **Preview**: `npm preview`

## Future Considerations
- Additional point cloud formats (LAS, XYZ)
- More camera animation presets
- Advanced lighting controls
- Point cloud editing capabilities
- Multi-model loading and comparison