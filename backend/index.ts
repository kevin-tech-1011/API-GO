import './config/env'
import express from 'express'
import { dbReady } from './db'
import { seedProfileUsers } from './db/profileUser'
import { registerRoutes } from './routes'
import { createServer } from 'http'
import cors from 'cors'
import passport from 'passport'
import configPassport from './config/passport'
import path from 'path'
import fs from 'fs'

const app = express()
app.use(express.json())
app.use(express.urlencoded({ extended: false }))

app.use(cors())
configPassport(passport)
app.use(passport.initialize())

registerRoutes(app)

const server = createServer(app)

;(async () => {
    await dbReady
    await seedProfileUsers()

    const isProd = process.env.NODE_ENV === 'production'

    if (!isProd) {
        const { createServer: createViteServer } = await import('vite')
        const vite = await createViteServer({
            root: path.resolve(process.cwd(), 'frontend'),
            mode: 'development',
            logLevel: 'warn',
            server: {
                middlewareMode: true,
                hmr: { server },
            },
            appType: 'spa',
        })
        app.use(vite.middlewares)
    } else {
        const distDir = path.resolve(process.cwd(), 'frontend', 'dist')
        const distIndexFile = path.join(distDir, 'index.html')
        const hasFrontendDist = fs.existsSync(distIndexFile)
        if (hasFrontendDist) {
            app.use(express.static(distDir))
            app.get('*', (_, res) => {
                res.sendFile(distIndexFile)
            })
        } else {
            app.get('*', (_, res) => {
                res.status(404).json({
                    message:
                        'Frontend build not found. Run "npm run build:frontend" for production.',
                })
            })
        }
    }

    const PORT = 5001
    server.listen(PORT, '0.0.0.0', () => {
        console.log(`serving on port ${PORT}`)
    })
})()

export default app
