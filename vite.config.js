import { defineConfig } from 'vite'

export default defineConfig({
  // Base path for Netlify deployment - use root path
  base: '/',
  
  build: {
    // Use esbuild for minification (default, faster than terser)
    minify: 'esbuild',
    
    // Enable WebWorker support
    target: 'esnext',
    
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
          
          // Remove manual chunk splitting for effects and interface
          // This was causing effects modules to load on homepage
          // Let Vite handle chunking automatically based on imports
          
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
  
  // Optimize dependencies and worker support
  optimizeDeps: {
    include: ['three']
  },
  
  // Worker configuration
  worker: {
    format: 'es'
  }
})