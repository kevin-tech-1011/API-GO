import type { Express } from 'express'
import auth from './auth.route'
import openai from './openai.route'
import profile from './profile.route'
import profileUser from './profileUser.route'
import history from './history.route'
import user from './user.route'
import backup from './backup.route'
import statistics from './statistics.route'
import check from './check.route'
import calendar from './calendar.route'
import pdf from './resumePdf.route'

export function registerRoutes(app: Express) {
    app.use('/api/auth', auth)
    app.use('/api/profile', profile)
    app.use('/api/profile-user', profileUser)
    app.use('/api/history', history)
    app.use('/api/openai', openai)
    app.use('/api/user', user)
    app.use('/api/backup', backup)
    app.use('/api/statistics', statistics)
    app.use('/api/check', check)
    app.use('/api/calendar', calendar)
    app.use('/api/pdf', pdf)
}
