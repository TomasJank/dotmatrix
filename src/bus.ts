import { Cart } from './cart'

export class Bus {
  serialOut = ''
  if_ = 0xE1
  ie = 0
  vram = new Uint8Array(0x2000)
  oam = new Uint8Array(0xA0)
  ioHooks = new Map<number, { read?: () => number; write?: (v: number) => void }>()

  private wram = new Uint8Array(0x2000)
  private extram = new Uint8Array(0x2000)
  private hram = new Uint8Array(0x7F)
  private sb = 0

  constructor(private cart: Cart) {}

  read(addr: number): number {
    if (addr < 0x8000) return this.cart.read(addr)
    if (addr < 0xA000) return this.vram[addr - 0x8000]
    if (addr < 0xC000) return this.extram[addr - 0xA000]
    if (addr < 0xE000) return this.wram[addr - 0xC000]
    if (addr < 0xFE00) return this.wram[addr - 0xE000]
    if (addr < 0xFEA0) return this.oam[addr - 0xFE00]
    if (addr === 0xFF0F) return this.if_ | 0xE0
    if (addr === 0xFFFF) return this.ie
    if (addr >= 0xFF80 && addr < 0xFFFF) return this.hram[addr - 0xFF80]
    const hook = this.ioHooks.get(addr)
    if (hook?.read) return hook.read()
    return 0xFF
  }

  write(addr: number, val: number): void {
    if (addr < 0x8000) return
    if (addr < 0xA000) { this.vram[addr - 0x8000] = val; return }
    if (addr < 0xC000) { this.extram[addr - 0xA000] = val; return }
    if (addr < 0xE000) { this.wram[addr - 0xC000] = val; return }
    if (addr < 0xFE00) { this.wram[addr - 0xE000] = val; return }
    if (addr < 0xFEA0) { this.oam[addr - 0xFE00] = val; return }
    if (addr === 0xFF0F) { this.if_ = val; return }
    if (addr === 0xFFFF) { this.ie = val; return }
    if (addr === 0xFF01) { this.sb = val; return }
    if (addr === 0xFF02) {
      if (val === 0x81) this.serialOut += String.fromCharCode(this.sb)
      return
    }
    if (addr >= 0xFF80 && addr < 0xFFFF) { this.hram[addr - 0xFF80] = val; return }
    const hook = this.ioHooks.get(addr)
    if (hook?.write) hook.write(val)
  }
}
