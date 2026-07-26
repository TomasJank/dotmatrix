import { GameBoy } from './gb'

const canvas = document.getElementById('screen') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!
const errBox = document.getElementById('error')!
let gb: GameBoy | null = null

const KEYS: Record<string, import('./joypad').Button> = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  KeyX: 'a', KeyZ: 'b', Enter: 'start', ShiftRight: 'select', ShiftLeft: 'select',
}
addEventListener('keydown', e => { const b = KEYS[e.code]; if (b && gb) { gb.joypad.press(b); e.preventDefault() } })
addEventListener('keyup', e => { const b = KEYS[e.code]; if (b && gb) gb.joypad.release(b) })

function start(buf: ArrayBuffer) {
  try { gb = new GameBoy(new Uint8Array(buf)); errBox.hidden = true } catch (e) { showError(e) }
}
function showError(e: unknown) { gb = null; errBox.textContent = String(e); errBox.hidden = false }

document.getElementById('rom')!.addEventListener('change', async e => {
  const f = (e.target as HTMLInputElement).files?.[0]
  if (f) start(await f.arrayBuffer())
})
addEventListener('dragover', e => e.preventDefault())
addEventListener('drop', async e => { e.preventDefault(); const f = e.dataTransfer?.files[0]; if (f) start(await f.arrayBuffer()) })

const frame = new ImageData(160, 144)
function loop() {
  if (gb) {
    try { gb.runFrame() } catch (e) { showError(e) }
    if (gb) { frame.data.set(gb.framebuffer); ctx.putImageData(frame, 0, 0) }
  }
  requestAnimationFrame(loop)
}
loop()
