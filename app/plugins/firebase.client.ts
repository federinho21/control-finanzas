import { getApps, initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider, inMemoryPersistence, setPersistence, signInWithPopup, signOut } from 'firebase/auth'

export default defineNuxtPlugin(() => {
  const config = useRuntimeConfig().public.firebase

  async function googleSignIn() {
    if (!config.apiKey || !config.authDomain || !config.projectId || !config.appId) {
      throw new Error('Firebase web configuration is missing.')
    }
    const app = getApps().find(app => app.name === 'control-finanzas-web')
      ?? initializeApp(config, 'control-finanzas-web')
    const auth = getAuth(app)
    await setPersistence(auth, inMemoryPersistence)
    const provider = new GoogleAuthProvider()
    provider.setCustomParameters({ prompt: 'select_account' })
    try {
      const result = await signInWithPopup(auth, provider)
      return await result.user.getIdToken(true)
    } finally {
      await signOut(auth)
    }
  }

  return { provide: { googleSignIn } }
})
