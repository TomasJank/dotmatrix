import { Bus } from './bus'

export const Z = 0x80
export const N = 0x40
export const HC = 0x20
export const CY = 0x10

// prettier-ignore
const CYCLES = new Uint8Array([
  4,12, 8, 8, 4, 4, 8, 4,20, 8, 8, 8, 4, 4, 8, 4, // 0x0_
  4,12, 8, 8, 4, 4, 8, 4,12, 8, 8, 8, 4, 4, 8, 4, // 0x1_
  8,12, 8, 8, 4, 4, 8, 4, 8, 8, 8, 8, 4, 4, 8, 4, // 0x2_
  8,12, 8, 8,12,12,12, 4, 8, 8, 8, 8, 4, 4, 8, 4, // 0x3_
  4, 4, 4, 4, 4, 4, 8, 4, 4, 4, 4, 4, 4, 4, 8, 4, // 0x4_
  4, 4, 4, 4, 4, 4, 8, 4, 4, 4, 4, 4, 4, 4, 8, 4, // 0x5_
  4, 4, 4, 4, 4, 4, 8, 4, 4, 4, 4, 4, 4, 4, 8, 4, // 0x6_
  8, 8, 8, 8, 8, 8, 4, 8, 4, 4, 4, 4, 4, 4, 8, 4, // 0x7_
  4, 4, 4, 4, 4, 4, 8, 4, 4, 4, 4, 4, 4, 4, 8, 4, // 0x8_
  4, 4, 4, 4, 4, 4, 8, 4, 4, 4, 4, 4, 4, 4, 8, 4, // 0x9_
  4, 4, 4, 4, 4, 4, 8, 4, 4, 4, 4, 4, 4, 4, 8, 4, // 0xA_
  4, 4, 4, 4, 4, 4, 8, 4, 4, 4, 4, 4, 4, 4, 8, 4, // 0xB_
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, // 0xC_ (task 4)
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, // 0xD_ (task 4)
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, // 0xE_ (task 4)
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, // 0xF_ (task 4)
])

export class CPU {
  a = 0x01
  f = 0xB0
  b = 0
  c = 0x13
  d = 0
  e = 0xD8
  h = 0x01
  l = 0x4D
  sp = 0xFFFE
  pc = 0x0100
  ime = false
  halted = false

  constructor(public bus: Bus) {}

  get hl(): number {
    return (this.h << 8) | this.l
  }
  set hl(v: number) {
    this.h = (v >> 8) & 0xFF
    this.l = v & 0xFF
  }
  get bc(): number {
    return (this.b << 8) | this.c
  }
  set bc(v: number) {
    this.b = (v >> 8) & 0xFF
    this.c = v & 0xFF
  }
  get de(): number {
    return (this.d << 8) | this.e
  }
  set de(v: number) {
    this.d = (v >> 8) & 0xFF
    this.e = v & 0xFF
  }

  private r8get(i: number): number {
    return [this.b, this.c, this.d, this.e, this.h, this.l, this.bus.read(this.hl), this.a][i]
  }
  private r8set(i: number, v: number) {
    switch (i) {
      case 0: this.b = v; break
      case 1: this.c = v; break
      case 2: this.d = v; break
      case 3: this.e = v; break
      case 4: this.h = v; break
      case 5: this.l = v; break
      case 6: this.bus.write(this.hl, v); break
      case 7: this.a = v; break
    }
  }

  private fetch8(): number {
    return this.bus.read(this.pc++)
  }
  private fetch16(): number {
    const lo = this.fetch8()
    const hi = this.fetch8()
    return (hi << 8) | lo
  }

  private add(v: number) {
    const a = this.a
    const r = a + v
    this.f = 0
    if ((r & 0xFF) === 0) this.f |= Z
    if (((a & 0xF) + (v & 0xF)) > 0xF) this.f |= HC
    if (r > 0xFF) this.f |= CY
    this.a = r & 0xFF
  }
  private adc(v: number) {
    const a = this.a
    const carry = (this.f & CY) ? 1 : 0
    const r = a + v + carry
    this.f = 0
    if ((r & 0xFF) === 0) this.f |= Z
    if (((a & 0xF) + (v & 0xF) + carry) > 0xF) this.f |= HC
    if (r > 0xFF) this.f |= CY
    this.a = r & 0xFF
  }
  private sub(v: number) {
    const a = this.a
    const r = a - v
    this.f = N
    if ((r & 0xFF) === 0) this.f |= Z
    if ((a & 0xF) < (v & 0xF)) this.f |= HC
    if (r < 0) this.f |= CY
    this.a = r & 0xFF
  }
  private sbc(v: number) {
    const a = this.a
    const carry = (this.f & CY) ? 1 : 0
    const r = a - v - carry
    this.f = N
    if ((r & 0xFF) === 0) this.f |= Z
    if ((a & 0xF) < (v & 0xF) + carry) this.f |= HC
    if (r < 0) this.f |= CY
    this.a = r & 0xFF
  }
  private and(v: number) {
    this.a &= v
    this.f = HC
    if (this.a === 0) this.f |= Z
  }
  private xor(v: number) {
    this.a ^= v
    this.f = 0
    if (this.a === 0) this.f |= Z
  }
  private or(v: number) {
    this.a |= v
    this.f = 0
    if (this.a === 0) this.f |= Z
  }
  private cp(v: number) {
    const a = this.a
    const r = a - v
    this.f = N
    if ((r & 0xFF) === 0) this.f |= Z
    if ((a & 0xF) < (v & 0xF)) this.f |= HC
    if (r < 0) this.f |= CY
  }

  private aluOp(y: number, v: number) {
    switch (y) {
      case 0: this.add(v); break
      case 1: this.adc(v); break
      case 2: this.sub(v); break
      case 3: this.sbc(v); break
      case 4: this.and(v); break
      case 5: this.xor(v); break
      case 6: this.or(v); break
      case 7: this.cp(v); break
    }
  }

  private inc8(v: number): number {
    const r = (v + 1) & 0xFF
    this.f &= CY
    if (r === 0) this.f |= Z
    if ((v & 0xF) === 0xF) this.f |= HC
    return r
  }
  private dec8(v: number): number {
    const r = (v - 1) & 0xFF
    this.f = (this.f & CY) | N
    if (r === 0) this.f |= Z
    if ((v & 0xF) === 0) this.f |= HC
    return r
  }

  private addHl(v: number) {
    const hl = this.hl
    const r = hl + v
    this.f &= Z
    if (((hl & 0xFFF) + (v & 0xFFF)) > 0xFFF) this.f |= HC
    if (r > 0xFFFF) this.f |= CY
    this.hl = r & 0xFFFF
  }

  private daa() {
    let a = this.a
    if (!(this.f & N)) {
      if ((this.f & CY) || a > 0x99) { a += 0x60; this.f |= CY }
      if ((this.f & HC) || (a & 0xF) > 0x09) a += 0x06
    } else {
      if (this.f & CY) a -= 0x60
      if (this.f & HC) a -= 0x06
    }
    a &= 0xFF
    this.f &= ~(Z | HC) & 0xF0
    if (a === 0) this.f |= Z
    this.a = a
  }

  private jr(cond: boolean): number {
    const off = this.fetch8()
    if (!cond) return 8
    const signed = off > 0x7F ? off - 0x100 : off
    this.pc = (this.pc + signed) & 0xFFFF
    return 12
  }

  step(): number {
    const pc = this.pc
    const op = this.fetch8()
    let cycles = CYCLES[op]

    if (op >= 0x40 && op <= 0x7F && op !== 0x76) {
      const y = (op >> 3) & 7
      const z = op & 7
      this.r8set(y, this.r8get(z))
      return cycles
    }

    if (op >= 0x80 && op <= 0xBF) {
      const y = (op >> 3) & 7
      const z = op & 7
      this.aluOp(y, this.r8get(z))
      this.f &= 0xF0
      return cycles
    }

    switch (op) {
      case 0x00: break // NOP
      case 0x76: this.halted = true; break // HALT

      case 0x01: this.bc = this.fetch16(); break
      case 0x11: this.de = this.fetch16(); break
      case 0x21: this.hl = this.fetch16(); break
      case 0x31: this.sp = this.fetch16(); break

      case 0x03: this.bc = (this.bc + 1) & 0xFFFF; break
      case 0x13: this.de = (this.de + 1) & 0xFFFF; break
      case 0x23: this.hl = (this.hl + 1) & 0xFFFF; break
      case 0x33: this.sp = (this.sp + 1) & 0xFFFF; break
      case 0x0B: this.bc = (this.bc - 1) & 0xFFFF; break
      case 0x1B: this.de = (this.de - 1) & 0xFFFF; break
      case 0x2B: this.hl = (this.hl - 1) & 0xFFFF; break
      case 0x3B: this.sp = (this.sp - 1) & 0xFFFF; break

      case 0x04: this.b = this.inc8(this.b); break
      case 0x0C: this.c = this.inc8(this.c); break
      case 0x14: this.d = this.inc8(this.d); break
      case 0x1C: this.e = this.inc8(this.e); break
      case 0x24: this.h = this.inc8(this.h); break
      case 0x2C: this.l = this.inc8(this.l); break
      case 0x34: this.bus.write(this.hl, this.inc8(this.bus.read(this.hl))); break
      case 0x3C: this.a = this.inc8(this.a); break

      case 0x05: this.b = this.dec8(this.b); break
      case 0x0D: this.c = this.dec8(this.c); break
      case 0x15: this.d = this.dec8(this.d); break
      case 0x1D: this.e = this.dec8(this.e); break
      case 0x25: this.h = this.dec8(this.h); break
      case 0x2D: this.l = this.dec8(this.l); break
      case 0x35: this.bus.write(this.hl, this.dec8(this.bus.read(this.hl))); break
      case 0x3D: this.a = this.dec8(this.a); break

      case 0x06: this.b = this.fetch8(); break
      case 0x0E: this.c = this.fetch8(); break
      case 0x16: this.d = this.fetch8(); break
      case 0x1E: this.e = this.fetch8(); break
      case 0x26: this.h = this.fetch8(); break
      case 0x2E: this.l = this.fetch8(); break
      case 0x36: this.bus.write(this.hl, this.fetch8()); break
      case 0x3E: this.a = this.fetch8(); break

      case 0x02: this.bus.write(this.bc, this.a); break
      case 0x12: this.bus.write(this.de, this.a); break
      case 0x22: this.bus.write(this.hl, this.a); this.hl = (this.hl + 1) & 0xFFFF; break
      case 0x32: this.bus.write(this.hl, this.a); this.hl = (this.hl - 1) & 0xFFFF; break
      case 0x0A: this.a = this.bus.read(this.bc); break
      case 0x1A: this.a = this.bus.read(this.de); break
      case 0x2A: this.a = this.bus.read(this.hl); this.hl = (this.hl + 1) & 0xFFFF; break
      case 0x3A: this.a = this.bus.read(this.hl); this.hl = (this.hl - 1) & 0xFFFF; break

      case 0x08: {
        const addr = this.fetch16()
        this.bus.write(addr, this.sp & 0xFF)
        this.bus.write((addr + 1) & 0xFFFF, (this.sp >> 8) & 0xFF)
        break
      }

      case 0x09: this.addHl(this.bc); break
      case 0x19: this.addHl(this.de); break
      case 0x29: this.addHl(this.hl); break
      case 0x39: this.addHl(this.sp); break

      case 0x07: { // RLCA
        const carry = (this.a >> 7) & 1
        this.a = ((this.a << 1) | carry) & 0xFF
        this.f = carry ? CY : 0
        break
      }
      case 0x0F: { // RRCA
        const carry = this.a & 1
        this.a = ((this.a >> 1) | (carry << 7)) & 0xFF
        this.f = carry ? CY : 0
        break
      }
      case 0x17: { // RLA
        const carryIn = (this.f & CY) ? 1 : 0
        const carryOut = (this.a >> 7) & 1
        this.a = ((this.a << 1) | carryIn) & 0xFF
        this.f = carryOut ? CY : 0
        break
      }
      case 0x1F: { // RRA
        const carryIn = (this.f & CY) ? 1 : 0
        const carryOut = this.a & 1
        this.a = ((this.a >> 1) | (carryIn << 7)) & 0xFF
        this.f = carryOut ? CY : 0
        break
      }

      case 0x27: this.daa(); break
      case 0x2F: this.a = (~this.a) & 0xFF; this.f = (this.f & (Z | CY)) | N | HC; break
      case 0x37: this.f = (this.f & Z) | CY; break
      case 0x3F: this.f = (this.f & (Z | CY)) ^ CY; break

      case 0x18: cycles = this.jr(true); break
      case 0x20: cycles = this.jr(!(this.f & Z)); break
      case 0x28: cycles = this.jr(!!(this.f & Z)); break
      case 0x30: cycles = this.jr(!(this.f & CY)); break
      case 0x38: cycles = this.jr(!!(this.f & CY)); break

      case 0x10: this.fetch8(); break // STOP

      default:
        throw new Error(`unimplemented opcode 0x${op.toString(16)} at 0x${pc.toString(16)}`)
    }

    this.f &= 0xF0
    return cycles
  }
}
