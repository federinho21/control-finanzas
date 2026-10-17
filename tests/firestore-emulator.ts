import { execFile, spawn } from 'node:child_process'
import { mkdtemp, readdir } from 'node:fs/promises'
import { createServer } from 'node:net'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

export async function startFirestoreEmulator() {
  const cache = join(homedir(), '.cache', 'firebase', 'emulators')
  const jars = (await readdir(cache)).filter(file => /^cloud-firestore-emulator-v.*\.jar$/.test(file)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  if (!jars.length) throw new Error('Download the official Firestore emulator using Firebase CLI before running this test.')
  const root = process.platform === 'win32' ? join(process.env.LOCALAPPDATA!, 'Temp', 'opencode') : tmpdir()
  const directory = await mkdtemp(join(root, 'finanzas-firestore-test-'))
  async function freePort() {
    const socket = createServer()
    await new Promise<void>(resolve => socket.listen(0, '127.0.0.1', resolve))
    const port = (socket.address() as { port: number }).port
    await new Promise<void>(resolve => socket.close(() => resolve()))
    return port
  }
  const port = await freePort(), websocket = await freePort()
  const java = process.env.JAVA_HOME ? join(process.env.JAVA_HOME, 'bin', process.platform === 'win32' ? 'java.exe' : 'java') : 'java'
  const child = spawn(java, ['-jar', join(cache, jars[jars.length - 1]!), '--host', '127.0.0.1', '--port', String(port), '--websocket_port', String(websocket), '--project_id', 'demo-control-finanzas', '--single_project_mode', '--single_project_mode_error', '--rules', resolve('firestore.rules')], { cwd: directory, stdio: ['ignore', 'pipe', 'pipe'] })
  let output = ''
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Firestore startup timed out: ${output}`)), 45000)
      child.once('error', error => { clearTimeout(timer); reject(error) })
      child.once('exit', code => { clearTimeout(timer); reject(new Error(`Firestore exited (${code}): ${output}`)) })
      const ready = (chunk: Buffer) => {
        output += chunk.toString()
        if (output.includes('Dev App Server is now running')) { clearTimeout(timer); resolve() }
      }
      child.stdout.on('data', ready)
      child.stderr.on('data', ready)
    })
  } catch (error) { child.kill(); throw error }
  return { host: `127.0.0.1:${port}`, directory, stop: async () => {
    if (child.exitCode !== null || child.signalCode !== null) return
    const closed = new Promise<void>(resolve => child.once('close', () => resolve()))
    if (process.platform === 'win32' && child.pid) {
      await new Promise<void>((resolve, reject) => execFile('taskkill', ['/PID', String(child.pid), '/T', '/F'], error => error ? reject(error) : resolve()))
    } else child.kill()
    await closed
  } }
}
