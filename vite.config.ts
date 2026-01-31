import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  worker: {
    format: 'iife' // Use IIFE format for classic workers
  },
  build: {
    target: 'es2020'
  }
})
