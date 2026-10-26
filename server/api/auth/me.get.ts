import { eventHandler } from 'h3'
import { requireUser } from '../../utils/auth'

export default eventHandler(async event => ({ user: await requireUser(event) }))
