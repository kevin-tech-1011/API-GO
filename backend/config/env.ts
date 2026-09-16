import dotenv from 'dotenv'
import fs from 'fs'
import path from 'path'

/** Load `.env` from project root before any OpenAI client is created. */
function loadEnvFile(): void {
    const candidates = [
        path.resolve(process.cwd(), '.env'),
        path.resolve(__dirname, '../../.env'),
        path.resolve(__dirname, '../../../.env'),
    ]
    for (const envPath of candidates) {
        if (fs.existsSync(envPath)) {
            dotenv.config({ path: envPath })
            return
        }
    }
    dotenv.config()
}

loadEnvFile()

export function getOpenAiApiKey(): string | undefined {
    const key = process.env.OPENAI_API_KEY?.trim()
    return key === '' ? undefined : key
}
