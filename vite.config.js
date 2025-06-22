import { defineConfig } from 'vite'

export default defineConfig({
  // Base path for Netlify deployment - use root path
  base: '/',
  
  build: {
    // Use esbuild for minification (default, faster than terser)
    minify: 'esbuild',
    
    // Optimize bundle with strategic code splitting
    rollupOptions: {
      output: {
        manualChunks: {
          // Three.js core library (largest dependency)
          'vendor-three': ['three'],
          
          // Three.js addons and loaders
          'vendor-three-addons': [
            'three/examples/jsm/controls/OrbitControls.js',
            'three/examples/jsm/loaders/PLYLoader.js',
            'three/examples/jsm/loaders/EXRLoader.js'
          ],
          
          // Effects system (post-processing pipeline)
          'effects': [
            './src/effects/index.ts',
            './src/effects/EffectsChainManager.ts',
            './src/effects/PostProcessingPass.ts',
            './src/effects/TSLPostProcessingPass.ts',
            './src/effects/ASCIIDitheringPass.ts',
            './src/effects/HalftoneDitheringPass.ts',
            './src/effects/TSLEffect.ts'
          ],
          
          // Interface and UI components
          'interface': [
            './src/interface/index.ts',
            './src/interface/ContentLoader.ts',
            './src/interface/EffectsPanel.ts'
          ],
          
          // Camera and model management systems
          'systems': [
            './src/camera/index.ts',
            './src/camera/OrbitalCameraSystem.ts',
            './src/models/index.ts',
            './src/models/ModelManager.ts',
            './src/models/SphereInstancer.ts'
          ]
        }
      }
    }
  },
  
  // Ensure assets are properly handled
  assetsInclude: ['**/*.ply'],
  
  // Development server configuration
  server: {
    host: true,
    port: 5173
  },
  
  // Preview server configuration (for production builds)
  preview: {
    host: true,
    port: 4173
  },
  
  // Add custom plugin to set cross-origin isolation headers
  plugins: [
    {
      name: 'cross-origin-isolation',
      configureServer(server) {
        server.middlewares.use((_req, res, next) => {
          res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
          res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp')
          next()
        })
      },
      configurePreviewServer(server) {
        server.middlewares.use((_req, res, next) => {
          res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
          res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp')
          next()
        })
      }
    }
  ],
  
  // Optimize dependencies
  optimizeDeps: {
    include: ['three']
  }
})