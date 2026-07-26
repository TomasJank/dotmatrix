export class Cart {
  constructor(private rom: Uint8Array) {
    if (rom[0x147] !== 0) {
      throw new Error(`unsupported cart type 0x${rom[0x147].toString(16).padStart(2, '0')}`)
    }
  }

  read(addr: number): number {
    return this.rom[addr]
  }
}
