#!/usr/bin/env node
// Usage:
//   node scripts/set-password.mjs              # prompt for password, hashes it
//   node scripts/set-password.mjs <password>   # one-shot for CI / non-interactive
//
// Writes (or updates) VITE_NOTE_PASSWORD_HASH inside .env.local at the repo root.
// .env.local is gitignored — keep it out of git.

import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as readline from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'

const here = dirname(fileURLToPath(import.meta.url))
const envPath = resolve(here, '..', '.env.local')

async function promptPassword(label) {
  const rl = readline.createInterface({ input, output, terminal: true })
  // Mute echoing — replace each keystroke with no visible char
  const original = output.write.bind(output)
  let prompted = false
  output.write = (chunk, enc, cb) => {
    if (!prompted && typeof chunk === 'string' && chunk.includes(label)) {
      prompted = true
      return original(chunk, enc, cb)
    }
    if (prompted) return true
    return original(chunk, enc, cb)
  }
  try {
    const answer = await rl.question(label)
    return answer
  } finally {
    output.write = original
    rl.close()
    output.write('\n')
  }
}

async function main() {
  let password = process.argv[2]
  if (!password) {
    password = await promptPassword('Password (input hidden): ')
    if (!password) {
      console.error('Empty password — aborting')
      process.exit(1)
    }
  }
  if (password.length < 6) {
    console.error('Password is shorter than 6 chars — be more generous')
    process.exit(1)
  }
  const hash = createHash('sha256').update(password).digest('hex')

  let body = ''
  if (existsSync(envPath)) {
    body = readFileSync(envPath, 'utf8')
  }
  const line = `VITE_NOTE_PASSWORD_HASH=${hash}`
  if (/^VITE_NOTE_PASSWORD_HASH=/m.test(body)) {
    body = body.replace(/^VITE_NOTE_PASSWORD_HASH=.*$/m, line)
  } else {
    body += (body.endsWith('\n') || body.length === 0 ? '' : '\n') + line + '\n'
  }
  writeFileSync(envPath, body)
  console.log(`Wrote ${envPath}`)
  console.log(`  SHA-256: ${hash}`)
  console.log('')
  console.log('For the deployed site, set this same value as a GitHub repo secret named')
  console.log('  VITE_NOTE_PASSWORD_HASH')
  console.log('so the build picks it up (see .github/workflows/deploy.yml).')
}

main().catch((e) => { console.error(e); process.exit(1) })
