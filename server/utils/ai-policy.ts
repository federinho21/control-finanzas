import { createError } from 'h3'
import { AI_ENABLED, AI_DISABLED_MESSAGE } from '../../shared/finance-release'

export function requireAiEnabled() {
  if (!AI_ENABLED) throw createError({ statusCode: 503, statusMessage: 'AI disabled for this release.', data: { message: AI_DISABLED_MESSAGE } })
}
