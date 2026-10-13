import { eventHandler } from 'h3'
import { deleteAuthSession } from '../../utils/auth'

export default eventHandler(deleteAuthSession)
