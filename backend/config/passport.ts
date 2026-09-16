import { Strategy as JwtStrategy, ExtractJwt } from 'passport-jwt'
import User from '../db/user'
import dotenv from 'dotenv'

dotenv.config()

const opts = {
    jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
    secretOrKey: process.env.JWT_SECRET,
}

const configurePassport = (passport) => {
    passport.use(
        new JwtStrategy(opts, async (jwt_payload, done) => {
            try {
                const user = await User.findByPk(jwt_payload.id)
                if (user) return done(null, user)
                return done(null, false)
            } catch (error) {
                return done(error, false)
            }
        })
    )
}

export default configurePassport
