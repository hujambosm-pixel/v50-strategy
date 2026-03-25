#!/usr/bin/env node
/**
 * bump-version.js
 * Pre-commit hook: verifica que el número de versión ("Trading Simulator VX.YY")
 * en pages/index.js haya cambiado respecto al último commit.
 * Si no cambió, lo auto-incrementa y vuelve a hacer git add del archivo.
 */

const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const INDEX_FILE = path.join(__dirname, '..', 'pages', 'index.js')
const VERSION_RE = /Trading Simulator V(\d+)\.(\d+)/

function getVersion(content) {
  const m = content.match(VERSION_RE)
  return m ? { major: Number(m[1]), minor: Number(m[2]), str: `${m[1]}.${m[2]}` } : null
}

// Versión en el árbol de trabajo actual
const currentContent = fs.readFileSync(INDEX_FILE, 'utf8')
const currentVer = getVersion(currentContent)

if (!currentVer) {
  console.log('bump-version: no se encontró string de versión en index.js')
  process.exit(0)
}

// Versión en el último commit (HEAD)
let committedVer = null
try {
  const headContent = execSync('git show HEAD:pages/index.js', {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'ignore']
  })
  committedVer = getVersion(headContent)
} catch (_) {
  // Primer commit, sin HEAD — no hay nada que comparar
}

if (committedVer && currentVer.str === committedVer.str) {
  // Versión no fue bumpeada — auto-incrementar minor
  const newMinor = currentVer.minor + 1
  const newStr = `${currentVer.major}.${newMinor}`
  const newContent = currentContent.replace(
    /Trading Simulator V\d+\.\d+/g,
    `Trading Simulator V${newStr}`
  )
  fs.writeFileSync(INDEX_FILE, newContent)
  execSync(`git add "${INDEX_FILE.replace(/\\/g, '/')}"`)
  console.log(`\x1b[33m⚡ bump-version: V${currentVer.str} → V${newStr} (auto-incrementado)\x1b[0m`)
} else {
  const fromStr = committedVer ? `V${committedVer.str}` : '(primer commit)'
  console.log(`\x1b[32m✓ bump-version: V${currentVer.str} (desde ${fromStr})\x1b[0m`)
}
