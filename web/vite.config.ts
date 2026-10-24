import fs from 'node:fs'
import path from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

const DATA_DIR = path.resolve(__dirname, '../data')

// Serve the project's ../data folder at /data without copying ~1 GB of GeoJSON into public/.
function serveData(): Plugin {
  return {
    name: 'serve-data',
    configureServer(server) {
      server.middlewares.use('/data', (req, res, next) => {
        const rel = decodeURIComponent((req.url ?? '').split('?')[0])
        const file = path.join(DATA_DIR, rel)
        if (!file.startsWith(DATA_DIR) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return next()
        res.setHeader('Content-Type', 'application/geo+json')
        fs.createReadStream(file).pipe(res)
      })
    },
  }
}

export default defineConfig({
  // The Pages workflow sets BASE_PATH=/<repo>/; the build there copies ../data into dist/data.
  base: process.env.BASE_PATH ?? '/',
  plugins: [react(), serveData()],
})
