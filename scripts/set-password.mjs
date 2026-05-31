#!/usr/bin/env node
// Usage:
//   node scripts/set-password.mjs              # prompt for password (shown as *)
//   node scripts/set-password.mjs <password>   # one-shot, no prompt
//
// Writes (or updates) VITE_NOTE_PASSWORD_HASH inside .env.local at the repo root.
// .env.local is gitignored — keep it out of git.

import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { stdin as input, stdout as output } from 'node:process'

const here = dirname(fileURLToPath(import.meta.url))
const envPath = resolve(here, '..', '.env.local')

function promptPassword(label) {
  return new Promise((resolveP, rejectP) => {
    if (!input.isTTY) {
      rejectP(
        new Error(
          'No TTY detected. Pass the password as the first argument instead:\n  node scripts/set-password.mjs <password>',
        ),
      )
      return
    }
    output.write(label)
    const chars = []
    input.setRawMode(true)
    input.resume()
    input.setEncoding('utf8')

    const cleanup = () => {
      input.setRawMode(false)
      input.pause()
      input.removeListener('data', onData)
    }

    const onData = (key) => {
      // Each keystroke arrives as a string. Handle one rune at a time.
      for (const ch of key) {
        if (ch === '') {
          // Ctrl+C
          cleanup()
          output.write('\n')
          process.exit(130)
        } else if (ch === '\r' || ch === '\n') {
          cleanup()
          output.write('\n')
          resolveP(chars.join(''))
          return
        } else if (ch === '' || ch === '\b') {
          // backspace / delete
          if (chars.length > 0) {
            chars.pop()
            output.write('\b \b')
          }
        } else if (ch >= ' ') {
          chars.push(ch)
          output.write('*')
        }
      }
    }
    input.on('data', onData)
  })
}

async function main() {
  let password = process.argv[2]
  if (!password) {
    password = await promptPassword('Password: ')
    if (password) {
      const confirm = await promptPassword('Confirm:  ')
      if (password !== confirm) {
        console.error('Passwords did not match — aborting')
        process.exit(1)
      }
    }
  }
  if (!password) {
    console.error('Empty password — aborting')
    process.exit(1)
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
  console.log(`\n✓ Wrote ${envPath}`)
  console.log(`  SHA-256: ${hash}`)
  console.log('')
  console.log('Paste the SHA-256 above into GitHub repo secrets as')
  console.log('  VITE_NOTE_PASSWORD_HASH')
  console.log('so the deployed build picks it up.')
}

main().catch((e) => { console.error(e.message || e); process.exit(1) })
