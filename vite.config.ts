import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const repoName = process.env.GITHUB_REPOSITORY?.split('/')[1]
const isGhPages = process.env.GITHUB_ACTIONS === 'true' && Boolean(repoName)

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: isGhPages ? `/${repoName}/` : '/',
})
