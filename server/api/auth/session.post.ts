import { eventHandler } from 'h3'
import { createAuthSession } from '../../utils/auth'

export default eventHandler(createAuthSession)
