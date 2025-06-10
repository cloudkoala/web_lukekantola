import { defineConfig } from 'vite'

export default defineConfig({
  // Base path for GitHub Pages - matches your repository name
  // For username.github.io: base: '/'
  // For username.github.io/repo-name: base: '/repo-name/'
  base: '/gsplat-testing/',
  
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
  
  // Optimize dependencies
  optimizeDeps: {
    include: ['three']
  }
})