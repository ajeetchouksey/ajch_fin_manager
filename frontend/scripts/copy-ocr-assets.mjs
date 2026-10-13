// Copies the on-device OCR engine (tesseract.js worker, core and language data) into
// public/ocr so receipts and scans are read entirely in the browser, without any CDN call.
import { copyFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const nm = join(root, 'node_modules')
const out = join(root, 'public', 'ocr')
mkdirSync(out, { recursive: true })

const files = [
  ['tesseract.js/dist/worker.min.js', 'worker.min.js'],
  ['tesseract.js-core/tesseract-core-lstm.wasm.js', 'tesseract-core-lstm.wasm.js'],
  ['tesseract.js-core/tesseract-core-simd-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js'],
  ['tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js', 'tesseract-core-relaxedsimd-lstm.wasm.js'],
  ['@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz', 'eng.traineddata.gz'],
  ['@tesseract.js-data/deu/4.0.0_best_int/deu.traineddata.gz', 'deu.traineddata.gz'],
]
for (const [from, to] of files) copyFileSync(join(nm, from), join(out, to))
console.log(`OCR assets copied to public/ocr (${files.length} files)`)
