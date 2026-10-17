export default defineNuxtRouteMiddleware(async to => {
  if (import.meta.server) {
    useResponseHeader('Cache-Control').value = 'no-store'
    useResponseHeader('Vary').value = 'Cookie'
  }
  const auth = useAuth()
  await auth.restore(true)
  if (to.path === '/login') {
    if (auth.user.value && !auth.busy.value) return navigateTo('/')
    return
  }
  if (!auth.user.value) return navigateTo('/login')
})
