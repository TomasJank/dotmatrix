import { Bus } from './bus'

const SHADES = [
  [224, 248, 208],
  [136, 192, 112],
  [52, 104, 86],
  [8, 24, 32],
]

const MODE_OAM = 2
const MODE_TRANSFER = 3
const MODE_HBLANK = 0
const MODE_VBLANK = 1

export class PPU {
  framebuffer = new Uint8ClampedArray(160 * 144 * 4)

  private lcdc = 0
  private stat = 0
  private scy = 0
  private scx = 0
  private ly = 0
  private lyc = 0
  private bgp = 0
  private obp0 = 0
  private obp1 = 0
  private wy = 0
  private wx = 0

  private lineCycles = 0
  private windowLine = 0
  private mode = MODE_OAM

  constructor(private bus: Bus) {
    bus.ioHooks.set(0xFF40, { read: () => this.lcdc, write: (v) => this.setLcdc(v) })
    bus.ioHooks.set(0xFF41, { read: () => this.readStat(), write: (v) => { this.stat = v & 0x78 } })
    bus.ioHooks.set(0xFF42, { read: () => this.scy, write: (v) => { this.scy = v } })
    bus.ioHooks.set(0xFF43, { read: () => this.scx, write: (v) => { this.scx = v } })
    bus.ioHooks.set(0xFF44, { read: () => this.ly })
    bus.ioHooks.set(0xFF45, { read: () => this.lyc, write: (v) => { this.lyc = v } })
    bus.ioHooks.set(0xFF46, { write: (v) => this.dma(v) })
    bus.ioHooks.set(0xFF47, { read: () => this.bgp, write: (v) => { this.bgp = v } })
    bus.ioHooks.set(0xFF48, { read: () => this.obp0, write: (v) => { this.obp0 = v } })
    bus.ioHooks.set(0xFF49, { read: () => this.obp1, write: (v) => { this.obp1 = v } })
    bus.ioHooks.set(0xFF4A, { read: () => this.wy, write: (v) => { this.wy = v } })
    bus.ioHooks.set(0xFF4B, { read: () => this.wx, write: (v) => { this.wx = v } })
  }

  private setLcdc(v: number): void {
    const wasOn = this.lcdc & 0x80
    this.lcdc = v
    if (!(v & 0x80) && wasOn) {
      this.ly = 0
      this.mode = MODE_HBLANK
      this.lineCycles = 0
      this.windowLine = 0
    }
  }

  private readStat(): number {
    return 0x80 | (this.stat & 0x78) | ((this.ly === this.lyc ? 1 : 0) << 2) | this.mode
  }

  private dma(v: number): void {
    const base = v << 8
    for (let i = 0; i < 160; i++) this.bus.oam[i] = this.bus.read(base + i)
  }

  private setMode(mode: number): void {
    this.mode = mode
    const bit = mode === MODE_HBLANK ? 3 : mode === MODE_VBLANK ? 4 : mode === MODE_OAM ? 5 : -1
    if (bit >= 0 && (this.stat & (1 << bit))) this.bus.if_ |= 0x02
  }

  private checkLyc(): void {
    if (this.ly === this.lyc && (this.stat & 0x40)) this.bus.if_ |= 0x02
  }

  tick(cycles: number): void {
    if (!(this.lcdc & 0x80)) return

    let remaining = cycles
    while (remaining > 0) {
      const boundary = this.nextBoundary()
      const step = Math.min(remaining, boundary - this.lineCycles)
      this.lineCycles += step
      remaining -= step
      if (this.lineCycles >= boundary) this.onBoundary()
    }
  }

  // ly<144: OAM ends at 80, transfer ends at 252, hblank runs to line end (456).
  // ly>=144 (vblank): whole line runs to 456 with no mode change mid-line.
  private nextBoundary(): number {
    if (this.ly >= 144) return 456
    if (this.mode === MODE_OAM) return 80
    if (this.mode === MODE_TRANSFER) return 252
    return 456
  }

  private onBoundary(): void {
    if (this.ly < 144) {
      if (this.mode === MODE_OAM) {
        this.setMode(MODE_TRANSFER)
        return
      }
      if (this.mode === MODE_TRANSFER) {
        this.renderLine(this.ly)
        this.setMode(MODE_HBLANK)
        return
      }
    }

    this.lineCycles -= 456
    this.ly++
    if (this.ly === 144) {
      this.setMode(MODE_VBLANK)
      this.bus.if_ |= 0x01
    } else if (this.ly > 153) {
      this.ly = 0
      this.windowLine = 0
      this.setMode(MODE_OAM)
    } else if (this.ly < 144) {
      this.setMode(MODE_OAM)
    }
    this.checkLyc()
  }

  private renderLine(ly: number): void {
    const bgTilemap = this.lcdc & 0x08 ? 0x9C00 : 0x9800
    const winTilemap = this.lcdc & 0x40 ? 0x9C00 : 0x9800
    const signedTiles = !(this.lcdc & 0x10)
    const bgEnabled = this.lcdc & 0x01
    const winEnabled = (this.lcdc & 0x20) && this.wy <= ly
    const spritesEnabled = this.lcdc & 0x02
    const spriteHeight = this.lcdc & 0x04 ? 16 : 8

    let windowUsed = false
    const colorIndex = new Uint8Array(160)

    for (let x = 0; x < 160; x++) {
      const winX = x - (this.wx - 7)
      let color = 0

      if (winEnabled && winX >= 0) {
        windowUsed = true
        const py = this.windowLine
        const px = winX
        const tileIndex = this.readTileIndex(winTilemap, px, py)
        color = this.readTilePixel(tileIndex, px & 7, py & 7, signedTiles)
      } else if (bgEnabled) {
        const px = (x + this.scx) & 0xFF
        const py = (ly + this.scy) & 0xFF
        const tileIndex = this.readTileIndex(bgTilemap, px, py)
        color = this.readTilePixel(tileIndex, px & 7, py & 7, signedTiles)
      }

      colorIndex[x] = color
      this.setPixel(x, ly, this.shade(this.bgp, color))
    }

    if (windowUsed) this.windowLine++

    if (spritesEnabled) {
      const sprites: { y: number; x: number; tile: number; attrs: number; oamIndex: number }[] = []
      for (let i = 0; i < 40 && sprites.length < 10; i++) {
        const base = i * 4
        const y = this.bus.oam[base]
        const x = this.bus.oam[base + 1]
        const tile = this.bus.oam[base + 2]
        const attrs = this.bus.oam[base + 3]
        if (ly + 16 >= y && ly + 16 < y + spriteHeight) {
          sprites.push({ y, x, tile, attrs, oamIndex: i })
        }
      }

      sprites.sort((a, b) => (a.x !== b.x ? a.x - b.x : a.oamIndex - b.oamIndex))

      for (let s = sprites.length - 1; s >= 0; s--) {
        const sp = sprites[s]
        const screenX = sp.x - 8
        const screenY = sp.y - 16
        const xFlip = sp.attrs & 0x20
        const yFlip = sp.attrs & 0x40
        const bgPriority = sp.attrs & 0x80
        const palette = sp.attrs & 0x10 ? this.obp1 : this.obp0

        let row = ly - screenY
        if (yFlip) row = spriteHeight - 1 - row
        let tile = sp.tile
        if (spriteHeight === 16) tile &= 0xFE
        const tileRow = row & 7
        const tileNum = tile + (row >= 8 ? 1 : 0)

        for (let col = 0; col < 8; col++) {
          const px = screenX + col
          if (px < 0 || px >= 160) continue
          const tileCol = xFlip ? 7 - col : col
          const color = this.readTilePixelUnsigned(0x8000, tileNum, tileCol, tileRow)
          if (color === 0) continue
          if (bgPriority && colorIndex[px] !== 0) continue
          this.setPixel(px, ly, this.shade(palette, color))
        }
      }
    }
  }

  private readTileIndex(mapBase: number, px: number, py: number): number {
    const addr = mapBase + (py >> 3) * 32 + (px >> 3)
    return this.bus.read(addr)
  }

  private readTilePixel(tileIndex: number, col: number, row: number, signed: boolean): number {
    let addr: number
    if (signed) {
      const signedIndex = tileIndex > 127 ? tileIndex - 256 : tileIndex
      addr = 0x9000 + signedIndex * 16
    } else {
      addr = 0x8000 + tileIndex * 16
    }
    return this.readTileByte(addr, col, row)
  }

  private readTilePixelUnsigned(base: number, tileIndex: number, col: number, row: number): number {
    return this.readTileByte(base + tileIndex * 16, col, row)
  }

  private readTileByte(tileAddr: number, col: number, row: number): number {
    const rowAddr = tileAddr + row * 2
    const byte0 = this.bus.read(rowAddr)
    const byte1 = this.bus.read(rowAddr + 1)
    const bit = 7 - col
    const lo = (byte0 >> bit) & 1
    const hi = (byte1 >> bit) & 1
    return (hi << 1) | lo
  }

  private shade(palette: number, color: number): number {
    return (palette >> (color * 2)) & 0x03
  }

  private setPixel(x: number, y: number, shadeIndex: number): void {
    const rgb = SHADES[shadeIndex]
    const offset = (y * 160 + x) * 4
    this.framebuffer[offset] = rgb[0]
    this.framebuffer[offset + 1] = rgb[1]
    this.framebuffer[offset + 2] = rgb[2]
    this.framebuffer[offset + 3] = 255
  }
}
