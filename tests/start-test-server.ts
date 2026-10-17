import { spawn } from 'node:child_process'
import { mkdtemp } from 'node:fs/promises'
import { createServer } from 'node:net'
import { join, resolve } from 'node:path'

export async function startTestServer() {
  const temporaryRoot = process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'Temp', 'opencode') : process.env.TMPDIR
  if (!temporaryRoot) throw new Error('Set TMPDIR to an approved temporary directory.')
  const directory = await mkdtemp(join(temporaryRoot, 'finanzas-auth-test-'))
  const reservation = createServer()
  await new Promise<void>(resolve => reservation.listen(0, '127.0.0.1', resolve))
  const port = (reservation.address() as { port: number }).port
  await new Promise<void>(resolve => reservation.close(() => resolve()))
  const url = `http://127.0.0.1:${port}`
  const child = spawn(process.execPath, [resolve('.output/server/index.mjs')], {
    cwd: directory,
    env: {
      ...process.env, HOST: '127.0.0.1', PORT: String(port), AUTH_ORIGIN: url, FIREBASE_PROJECT_ID: '', NODE_ENV: 'production',
      GEMINI_API_KEY: '', NUXT_GEMINI_API_KEY: '', GOOGLE_APPLICATION_CREDENTIALS: '',
      NUXT_PUBLIC_FIREBASE_API_KEY: '', NUXT_PUBLIC_FIREBASE_AUTH_DOMAIN: '', NUXT_PUBLIC_FIREBASE_PROJECT_ID: '', NUXT_PUBLIC_FIREBASE_APP_ID: ''
    },
    stdio: ['ignore', 'pipe', 'pipe']
  })
  let output = ''
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Startup timed out: ${output}`)), 20000)
      child.once('error', error => { clearTimeout(timer); reject(error) })
      child.once('exit', code => { clearTimeout(timer); reject(new Error(`Server exited (${code}): ${output}`)) })
      child.stdout.on('data', chunk => {
        output += String(chunk)
        if (output.includes('Listening on')) { clearTimeout(timer); resolve() }
      })
      child.stderr.on('data', chunk => { output += String(chunk) })
    })
  } catch (error) {
    child.kill()
    throw error
  }
  return { url, directory, stop: () => child.kill() }
}
