import { Cart } from './cart'
import { Bus } from './bus'
import { CPU } from './cpu'
import { Timer } from './timer'

export function runBlargg(rom: Uint8Array, maxCycles = 250_000_000): string {
  const bus = new Bus(new Cart(rom))
  const cpu = new CPU(bus)
  const timer = new Timer(bus)
  let cycles = 0
  while (cycles < maxCycles) {
    cycles += (() => { const c = cpu.step(); timer.tick(c); return c })()
    if (bus.serialOut.includes('Passed') || bus.serialOut.includes('Failed')) break
  }
  return bus.serialOut
}
