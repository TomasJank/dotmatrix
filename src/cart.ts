export class Cart {
  constructor(private rom: Uint8Array) {
    const type = rom[0x147]
    // type 0 is ROM-only; MBC1 carts that fit in 32KB (2 fixed banks) never
    // actually bank-switch, so they behave identically to ROM-only.
    const noBankingNeeded = type === 0x00 || (type === 0x01 && rom.length <= 0x8000)
    if (!noBankingNeeded) {
      throw new Error(`unsupported cart type 0x${type.toString(16).padStart(2, '0')}`)
    }
  }

  read(addr: number): number {
    return this.rom[addr]
  }
}
