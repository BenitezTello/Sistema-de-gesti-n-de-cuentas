'use strict'
const crypto = require('crypto')

const KEY_HEX = process.env.ENCRYPTION_KEY
const ALGO    = 'aes-256-gcm'

function encrypt(text) {
  if (!KEY_HEX || !text) return text
  if (text.startsWith('enc:')) return text          // ya cifrado
  const key = Buffer.from(KEY_HEX, 'hex')
  const iv  = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv(ALGO, key, iv)
  const enc  = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])
  const tag  = cipher.getAuthTag()
  return `enc:${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`
}

function decrypt(text) {
  if (!KEY_HEX || !text) return text
  if (!text.startsWith('enc:')) return text         // texto plano (legacy)
  try {
    const [, ivHex, tagHex, encHex] = text.split(':')
    const key = Buffer.from(KEY_HEX, 'hex')
    const decipher = crypto.createDecipheriv(ALGO, key, Buffer.from(ivHex, 'hex'))
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'))
    return decipher.update(Buffer.from(encHex, 'hex')) + decipher.final('utf8')
  } catch {
    return text
  }
}

module.exports = { encrypt, decrypt }
