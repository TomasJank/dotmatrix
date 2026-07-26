import { Bus } from './bus'

const TIMA_PERIODS = [1024, 16, 64, 256]

export class Timer {
  private div = 0
  private tima = 0
  private tma = 0
  private tac = 0
  private divCounter = 0
  private timaCounter = 0

  constructor(private bus: Bus) {
    bus.ioHooks.set(0xFF04, {
      read: () => this.div,
      write: () => { this.div = 0; this.divCounter = 0 },
    })
    bus.ioHooks.set(0xFF05, {
      read: () => this.tima,
      write: (v) => { this.tima = v },
    })
    bus.ioHooks.set(0xFF06, {
      read: () => this.tma,
      write: (v) => { this.tma = v },
    })
    bus.ioHooks.set(0xFF07, {
      read: () => this.tac,
      write: (v) => { this.tac = v },
    })
  }

  tick(cycles: number): void {
    this.divCounter += cycles
    while (this.divCounter >= 256) {
      this.divCounter -= 256
      this.div = (this.div + 1) & 0xFF
    }

    if (!(this.tac & 0x04)) return
    const period = TIMA_PERIODS[this.tac & 0x03]
    this.timaCounter += cycles
    while (this.timaCounter >= period) {
      this.timaCounter -= period
      this.tima++
      if (this.tima > 0xFF) {
        this.tima = this.tma
        this.bus.if_ |= 0x04
      }
    }
  }
}
