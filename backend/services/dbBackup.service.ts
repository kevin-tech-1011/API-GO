import sqlite3 from 'sqlite3'
import fs from 'fs'
import path from 'path'

const DB_PATH = path.resolve('./db.sqlite')

function openDb(mode = sqlite3.OPEN_READONLY) {
    return new sqlite3.Database(DB_PATH, mode)
}

function allAsync(db: sqlite3.Database, sql: string, params: any[] = []) {
    return new Promise<any[]>((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) return reject(err)
            resolve(rows)
        })
    })
}

function execAsync(db: sqlite3.Database, sql: string) {
    return new Promise<void>((resolve, reject) => {
        db.exec(sql, (err) => {
            if (err) return reject(err)
            resolve()
        })
    })
}

export async function createSqlDump(): Promise<string> {
    if (!fs.existsSync(DB_PATH)) throw new Error('Database file not found')
    const db = openDb(sqlite3.OPEN_READONLY)

    try {
        const masters = await allAsync(db, `SELECT type, name, sql FROM sqlite_master WHERE sql NOT NULL ORDER BY type DESC, name`)

        let out = ''
        out += 'PRAGMA foreign_keys=OFF;\n'
        out += 'BEGIN TRANSACTION;\n'

        // append schema (tables, indexes, triggers, views)
        for (const row of masters) {
            if (row.type === 'table' && row.name === 'sqlite_sequence') continue
            // for generated (non-system) tables, add DROP TABLE IF EXISTS before CREATE
            if (row.type === 'table' && !row.name.startsWith('sqlite_')) {
                const tbl = row.name.replace(/"/g, '""')
                out += `DROP TABLE IF EXISTS "${tbl}";\n`
            }
            out += `${row.sql};\n`
        }

        // append data as INSERTs
        for (const row of masters) {
            if (row.type !== 'table') continue
            const table = row.name
            if (table === 'sqlite_sequence') continue
            const rows = await allAsync(db, `SELECT * FROM "${table}"`)
            for (const r of rows) {
                const cols = Object.keys(r).map((c) => `"${c.replace(/"/g, '""')}"`).join(', ')
                const vals = Object.values(r).map((v) => {
                    if (v === null) return 'NULL'
                    if (typeof v === 'number') return v.toString()
                    // escape single quotes
                    const s = (v || '').toString().replace(/'/g, "''")
                    return `'${s}'`
                }).join(', ')
                out += `INSERT INTO "${table}" (${cols}) VALUES (${vals});\n`
            }
        }

        out += 'COMMIT;\n'

        return out
    } finally {
        db.close()
    }
}

export async function restoreFromSql(sql: string): Promise<void> {
    const db = openDb(sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE)
    try {
        await execAsync(db, sql)
    } finally {
        db.close()
    }
}
