import { eventHandler } from 'h3'
import { financeHandlers } from '../utils/finance-handlers'
export default eventHandler(financeHandlers.sprints)
