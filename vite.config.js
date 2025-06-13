import { defineConfig } from 'vite'

export default defineConfig({
  // Base path for Netlify deployment - use root path
  base: '/',
  
  build: {
    // Use esbuild for minification (default, faster than terser)
    minify: 'esbuild',
    
    // Handle large chunks warning for Three.js
    rollupOptions: {
      output: {
        manualChunks: {
          'three': ['three'],
          'three-examples': [
            'three/examples/jsm/controls/OrbitControls.js',
            'three/examples/jsm/loaders/PLYLoader.js'
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