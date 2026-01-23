import { defineConfig } from 'vite'

export default defineConfig({
  worker: {
    format: 'iife' // Use IIFE format for classic workers
  },
  build: {
    target: 'es2020'
  }
})
