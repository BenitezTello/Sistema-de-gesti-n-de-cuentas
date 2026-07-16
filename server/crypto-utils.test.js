import { describe, it, expect } from 'vitest'
import { encrypt, decrypt } from './crypto-utils.js'

describe('crypto-utils', () => {
  it('encripta y desencripta un texto (round-trip)', () => {
    const original = 'dato-sensible-123'
    const encrypted = encrypt(original)
    expect(encrypted).not.toBe(original)
    expect(encrypted.startsWith('enc:')).toBe(true)
    expect(decrypt(encrypted)).toBe(original)
  })

  it('no vuelve a encriptar un texto que ya tiene el prefijo "enc:"', () => {
    const alreadyEncrypted = 'enc:abc:def:123'
    expect(encrypt(alreadyEncrypted)).toBe(alreadyEncrypted)
  })

  it('decrypt devuelve el mismo texto si no tiene el prefijo "enc:" (texto plano legacy)', () => {
    const plain = 'texto-sin-cifrar'
    expect(decrypt(plain)).toBe(plain)
  })

  it('decrypt no lanza excepción con un valor corrupto y devuelve el texto tal cual', () => {
    const corrupted = 'enc:00:00:00'
    expect(() => decrypt(corrupted)).not.toThrow()
    expect(decrypt(corrupted)).toBe(corrupted)
  })

  it('encrypt devuelve el mismo valor si el texto es vacío o nulo', () => {
    expect(encrypt('')).toBe('')
    expect(encrypt(null)).toBe(null)
  })
})
