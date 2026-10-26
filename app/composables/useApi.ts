import type { NitroFetchOptions } from 'nitropack/types'

export function useApi() {
  const request = useRequestFetch()
  const auth = useAuth()
  return <T>(path: string, options: NitroFetchOptions<string> = {}) => {
    if (!path.startsWith('/api/') || path.includes('\\')) throw new Error('Only local API paths are allowed.')
    return auth.request(signal => request<T>(path, { ...options, credentials: 'include', retry: 0, signal }))
  }
}
