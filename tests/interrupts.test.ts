import { describe, it, expect } from 'vitest'
import { Cart } from '../src/cart'
import { Bus } from '../src/bus'
import { CPU } from '../src/cpu'
import { Timer } from '../src/timer'

function setup(code: number[]) {
  const rom = new Uint8Array(0x8000)
  rom.set(code, 0x0100)
  const bus = new Bus(new Cart(rom))
  return { bus, cpu: new CPU(bus), timer: new Timer(bus) }
}

describe('interrupts', () => {
  it('dispatches vblank to 0x40 and clears IF bit', () => {
    const { bus, cpu } = setup([0x00])
    cpu.ime = true; bus.ie = 0x01; bus.if_ = 0x01
    expect(cpu.step()).toBe(20)
    expect(cpu.pc).toBe(0x0040)
    expect(bus.if_ & 0x01).toBe(0)
    expect(cpu.ime).toBe(false)
  })
  it('EI enables only after the next instruction', () => {
    const { bus, cpu } = setup([0xFB, 0x00, 0x00]) // EI; NOP; NOP
    bus.ie = 0x01; bus.if_ = 0x01
    cpu.step() // EI
    cpu.step() // NOP — interrupt must NOT fire before this
    expect(cpu.pc).toBe(0x0102)
    cpu.step() // now it fires
    expect(cpu.pc).toBe(0x0040)
  })
  it('HALT wakes on pending interrupt even with ime off', () => {
    const { bus, cpu } = setup([0x76, 0x00]) // HALT; NOP
    cpu.step()
    expect(cpu.halted).toBe(true)
    cpu.step() // still halted, nothing pending
    expect(cpu.halted).toBe(true)
    bus.ie = 0x04; bus.if_ = 0x04
    cpu.step()
    expect(cpu.halted).toBe(false)
  })
})

describe('timer', () => {
  it('DIV counts every 256 cycles and resets on write', () => {
    const { bus, timer } = setup([])
    timer.tick(512)
    expect(bus.read(0xFF04)).toBe(2)
    bus.write(0xFF04, 0x99)
    expect(bus.read(0xFF04)).toBe(0)
  })
  it('TIMA overflow reloads TMA and raises IF bit 2', () => {
    const { bus, timer } = setup([])
    bus.write(0xFF06, 0x33)       // TMA
    bus.write(0xFF07, 0x05)       // TAC: enabled, 16-cycle period
    bus.write(0xFF05, 0xFF)       // TIMA
    timer.tick(16)
    expect(bus.read(0xFF05)).toBe(0x33)
    expect(bus.if_ & 0x04).toBe(0x04)
  })
})
