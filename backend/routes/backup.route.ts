import express from 'express'
import multer from 'multer'
import { createSqlDump, restoreFromSql } from '../services/dbBackup.service'

const router = express.Router()
const upload = multer({ storage: multer.memoryStorage() })

router.get('/download', async (_, res) => {
    try {
        const sql = await createSqlDump()
        res.setHeader('Content-Type', 'application/sql')
        res.setHeader('Content-Disposition', 'attachment; filename="backup.sql"')
        res.send(sql)
    } catch (err: any) {
        res.status(500).json({ message: err.message || 'Failed to create dump' })
    }
})

router.post('/restore', upload.single('file'), async (req: any, res) => {
    try {
        if (!req.file) return res.status(400).json({ message: 'No file uploaded' })
        const sql = req.file.buffer.toString('utf8')
        await restoreFromSql(sql)
        res.json({ message: 'Database restored successfully' })
    } catch (err: any) {
        res.status(500).json({ message: err.message || 'Failed to restore database' })
    }
})

export default router
