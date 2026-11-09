/** Dragonfly's science instruments, as the three kinds of target the pilot can service. */
export type InstrumentId = 'dragms' | 'dragns' | 'dragoncam';

export interface Instrument {
  /** Short HUD label. */
  label: string;
  /** What the pilot is doing while the target progress fills. */
  verb: string;
  /** Seconds of uninterrupted work to finish the job. */
  needTime: number;
  /** Science points once the data reaches the base. */
  value: number;
  /** True: land on the target. False: hover nearby in the air. */
  landing: boolean;
  color: string;
}

export const INSTRUMENTS: Record<InstrumentId, Instrument> = {
  // Drill sample fed to the DraMS mass spectrometer: the big prize, takes a while.
  dragms: { label: 'DraMS', verb: 'DRILLING', needTime: 4, value: 250, landing: true, color: '#ff7a3a' },
  // Gamma-ray and neutron spectrometer reads the soil from a landed craft.
  dragns: { label: 'DraGNS', verb: 'SCANNING', needTime: 2, value: 100, landing: true, color: '#5fd0ff' },
  // DragonCam imaging: a quick hover in the right altitude band.
  dragoncam: { label: 'DragonCam', verb: 'IMAGING', needTime: 1, value: 100, landing: false, color: '#c79bff' },
};
