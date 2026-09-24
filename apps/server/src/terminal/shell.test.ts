import { describe, expect, test } from 'bun:test'
import { containerShellCandidates, isValidShell } from './shell'

describe('containerShellCandidates', () => {
  test('coba bash dulu, terus sh', () => {
    const c = containerShellCandidates()
    expect(c[0]).toContain('bash')
    expect(c[c.length - 1]).toContain('sh')
  })

  test('selalu ada fallback sh', () => {
    // Alpine nggak punya bash. Kalau cuma coba bash, container Alpine
    // nggak bisa dibuka terminalnya.
    expect(containerShellCandidates().some((c) => c.endsWith('sh'))).toBe(true)
  })
})

describe('isValidShell', () => {
  test('terima shell yang dikenal', () => {
    expect(isValidShell('bash')).toBe(true)
    expect(isValidShell('/bin/sh')).toBe(true)
    expect(isValidShell('sh')).toBe(true)
  })

  test('tolak yang aneh', () => {
    expect(isValidShell('rm -rf /')).toBe(false)
    expect(isValidShell('/bin/bash; rm -rf /')).toBe(false)
    expect(isValidShell('')).toBe(false)
    expect(isValidShell('bash\nrm')).toBe(false)
  })
})
