#!/usr/bin/env node
/**
 * Export customer-clean pitch deck PDF (white slides only, no design chrome).
 * Usage: node docs/scripts/export-customer-pitch-deck-pdf.mjs [output.pdf]
 */
import { chromium } from 'playwright'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = process.env.INDOBASE_REPO ?? path.resolve(__dirname, '../..')
const htmlPath = path.join(repoRoot, 'docs/indobase-customer-pitch-deck.html')
const defaultOutputs = [
  path.join(repoRoot, 'docs/indobase-customer-pitch-deck.pdf'),
  '/Users/roshanraghavander/Downloads/indobase-pitch-deck/indobase-customer-pitch-deck.pdf',
]

const outputs = process.argv[2] ? [path.resolve(process.argv[2]), ...defaultOutputs] : defaultOutputs
const fileUrl = `file://${htmlPath}?export=customer&print=all`

for (const out of outputs) {
  fs.mkdirSync(path.dirname(out), { recursive: true })
}

const browser = await chromium.launch()
const page = await browser.newPage({
  viewport: { width: 1280, height: 800 },
})

await page.goto(fileUrl, { waitUntil: 'networkidle' })
await page.waitForFunction(() => document.fonts.ready)
await page.waitForTimeout(500)

const pdfBuffer = await page.pdf({
  printBackground: true,
  width: '1280px',
  height: '800px',
  margin: { top: '0', right: '0', bottom: '0', left: '0' },
  preferCSSPageSize: true,
})

await browser.close()

for (const out of [...new Set(outputs)]) {
  fs.writeFileSync(out, pdfBuffer)
  console.log(`Wrote ${out} (${pdfBuffer.length} bytes)`)
}
