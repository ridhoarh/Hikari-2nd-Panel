import { describe, expect, test } from 'bun:test'
import {
  bareRepoPath,
  hookScript,
  repoSlugFromApp,
  sshUrlFor,
  parsePushCommand,
} from './git-setup'

describe('repoSlugFromApp', () => {
  test('pakai slug app', () => {
    expect(repoSlugFromApp('blog')).toBe('blog')
  })

  test('buang karakter yang nggak aman buat nama folder', () => {
    expect(repoSlugFromApp('blog/api v2')).toBe('blog-api-v2')
  })

  test('kosong jadi "app"', () => {
    expect(repoSlugFromApp('!!!')).toBe('app')
  })
})

describe('bareRepoPath', () => {
  test('di dalam folder repos', () => {
    expect(bareRepoPath('/var/lib/hikari', 'blog')).toBe(
      '/var/lib/hikari/repos/blog.git'
    )
  })

  test('slug dibersihin dulu', () => {
    expect(bareRepoPath('/data', 'A B')).toBe('/data/repos/a-b.git')
  })
})

describe('sshUrlFor', () => {
  test('format ssh:// dengan port', () => {
    expect(sshUrlFor('blog', 'contoh.com', 2222)).toBe(
      'ssh://git@contoh.com:2222/blog.git'
    )
  })

  test('port 22 nggak ditulis karena udah default', () => {
    expect(sshUrlFor('blog', 'contoh.com', 22)).toBe('git@contoh.com:blog.git')
  })
})

describe('hookScript', () => {
  const script = hookScript({
    appId: '01HXYZ',
    apiUrl: 'http://127.0.0.1:2508',
    pushSecret: 'rahasia',
  })

  test('script sh dengan shebang', () => {
    expect(script).toStartWith('#!/bin/sh')
  })

  test('panggil endpoint deploy Hikari', () => {
    expect(script).toContain('/api/git-push/01HXYZ')
    expect(script).toContain('http://127.0.0.1:2508')
  })

  test('kirim secret buat verifikasi', () => {
    expect(script).toContain('rahasia')
  })

  test('nggak nge-block git push kalau Hikari mati', () => {
    // Hook yang gagal bikin push-nya keliatan gagal, padahal commit-nya
    // udah masuk ke repo. Errornya harus diabaikan.
    expect(script).toContain('|| true')
  })
})

describe('parsePushCommand', () => {
  test('baca perintah git-receive-pack', () => {
    expect(parsePushCommand("git-receive-pack 'blog.git'")).toBe('blog')
  })

  test('null kalau bukan perintah push', () => {
    expect(parsePushCommand('git-upload-pack')).toBeNull()
  })

  test('null kalau kosong', () => {
    expect(parsePushCommand('')).toBeNull()
  })
})
