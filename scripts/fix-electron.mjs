/**
 * Electron 官方 install.js 在「路径含空格」等环境下可能解压不完整。
 * 本脚本：缺 electron.exe 时强制重新下载并用 PowerShell Expand-Archive 解压。
 */
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const electronDir = path.join(root, 'node_modules', 'electron')
const distDir = path.join(electronDir, 'dist')
const exePath = path.join(distDir, 'electron.exe')
const pathTxt = path.join(electronDir, 'path.txt')

if (fs.existsSync(exePath)) {
  fs.writeFileSync(pathTxt, 'electron.exe')
  console.log('[fix:electron] OK:', exePath)
  process.exit(0)
}

if (!fs.existsSync(electronDir)) {
  console.error('[fix:electron] node_modules/electron missing. Run: npm install')
  process.exit(1)
}

const { version } = JSON.parse(fs.readFileSync(path.join(electronDir, 'package.json'), 'utf8'))
const zipName = `electron-v${version}-win32-x64.zip`
const url = `https://github.com/electron/electron/releases/download/v${version}/${zipName}`
const cacheDir = path.join(os.homedir(), 'AppData', 'Local', 'electron', 'Cache')
const tmpZip = path.join(os.tmpdir(), zipName)

console.log('[fix:electron] Downloading', url)

function tryCopyFromCache() {
  if (!fs.existsSync(cacheDir)) return null
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir)) {
      const p = path.join(dir, name)
      const st = fs.statSync(p)
      if (st.isDirectory()) {
        const hit = walk(p)
        if (hit) return hit
      } else if (name === zipName && st.size > 50_000_000) {
        return p
      }
    }
    return null
  }
  return walk(cacheDir)
}

let zipPath = tryCopyFromCache()
if (!zipPath) {
  try {
    execSync(`curl -L --retry 3 -o "${tmpZip}" "${url}"`, { stdio: 'inherit' })
    zipPath = tmpZip
  } catch {
    console.error('[fix:electron] Download failed. Check network / proxy.')
    process.exit(1)
  }
}

if (fs.existsSync(distDir)) fs.rmSync(distDir, { recursive: true, force: true })
fs.mkdirSync(distDir, { recursive: true })

console.log('[fix:electron] Extracting', zipPath)
execSync(
  `powershell -NoProfile -Command "Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${distDir.replace(/'/g, "''")}' -Force"`,
  { stdio: 'inherit' },
)

if (!fs.existsSync(exePath)) {
  console.error('[fix:electron] electron.exe still missing after extract')
  process.exit(1)
}

fs.writeFileSync(pathTxt, 'electron.exe')
console.log('[fix:electron] Repaired:', exePath)
