export class Cart {
  constructor(private rom: Uint8Array) {
    const type = rom[0x147]
    // any cart that fits in 32KB (2 fixed banks) never bank-switches, so it
    // behaves identically to ROM-only regardless of its MBC type byte; RAM
    // is already mapped at 0xA000, battery saves just don't persist
    if (rom.length > 0x8000) {
      throw new Error(`unsupported cart type 0x${type.toString(16).padStart(2, '0')}: needs bank switching`)
    }
  }

  read(addr: number): number {
    return this.rom[addr] ?? 0xFF
  }
}
