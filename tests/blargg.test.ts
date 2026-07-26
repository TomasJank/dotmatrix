import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { runBlargg } from '../src/headless'

const dir = join(__dirname, 'roms')
describe('blargg cpu_instrs', () => {
  for (const f of readdirSync(dir).filter(f => f.endsWith('.gb'))) {
    it(f, () => {
      const out = runBlargg(new Uint8Array(readFileSync(join(dir, f))))
      expect(out).toContain('Passed')
    }, 120_000)
  }
})
