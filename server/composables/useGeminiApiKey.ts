// Returns the Gemini API key from Nuxt runtime config.
export function useGeminiApiKey(): string {
  const runtimeConfig = useRuntimeConfig() as { geminiApiKey?: string }
  const apiKey = runtimeConfig.geminiApiKey?.trim()

  if (!apiKey) {
    throw new Error('geminiApiKey is required in runtimeConfig.')
  }

  return apiKey
}