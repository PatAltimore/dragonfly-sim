/** Dragonfly's science instruments, as the three kinds of target the pilot can service. */
export type InstrumentId = 'dragms' | 'dragns' | 'dragoncam';

export interface Instrument {
  /** Short HUD label. */
  label: string;
  /** Full name of the real instrument. */
  fullName: string;
  /** One line on what it does in the real mission, for briefings. */
  role: string;
  /** Short science notes shown one at a time as the pilot collects this kind of data. */
  notes: string[];
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
  dragms: {
    label: 'DraMS',
    fullName: 'Dragonfly Mass Spectrometer',
    role: 'Identifies the molecules in drilled samples, looking for chemistry relevant to biology.',
    notes: [
      'A mass spectrometer weighs molecules to identify them.',
      'The drill DrACO feeds samples to DraMS through hoses.',
      'DraMS hunts for organic chemistry relevant to biology.',
    ],
    verb: 'DRILLING',
    needTime: 4,
    value: 250,
    landing: true,
    color: '#ff7a3a',
  },
  // Gamma-ray and neutron spectrometer reads the soil from a landed craft.
  dragns: {
    label: 'DraGNS',
    fullName: 'Gamma-Ray and Neutron Spectrometer',
    role: 'Fires neutrons into the ground to read what elements lie beneath the lander.',
    notes: [
      'Neutron pulses make the ground give off telltale gamma rays.',
      'Each element glows at its own gamma-ray energies.',
      'This reads the ground beneath the lander, no drilling needed.',
    ],
    verb: 'SCANNING',
    needTime: 2,
    value: 100,
    landing: true,
    color: '#5fd0ff',
  },
  // DragonCam imaging: a quick hover in the right altitude band.
  dragoncam: {
    label: 'DragonCam',
    fullName: 'Dragonfly Camera Suite',
    role: 'Microscopic and panoramic cameras that image terrain and scout where to land next.',
    notes: [
      'Images help scientists choose the next safe landing site.',
      'Close-up microscopic imaging works at night with LED light.',
      'Panoramic views show dunes, ridges and the path ahead.',
    ],
    verb: 'IMAGING',
    needTime: 1,
    value: 100,
    landing: false,
    color: '#c79bff',
  },
};
