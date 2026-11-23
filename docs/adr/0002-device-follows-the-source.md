# The audio device follows the Source; no resampling in 0.1.0

DiffuScore plays a Source's PCM samples to the output unchanged: no gain, no processing, no resampling. When a Source is loaded, DiffuScore switches the audio device to the Source's sample rate. If it can't (an unsupported rate, JACK or PipeWire-JACK owning the rate, an interface locked to an external clock), playback is refused with a message telling the performer to convert the file or change the interface rate. The Source can still be viewed. The mismatch is found when the file is loaded at rehearsal, never mid-show.

## Considered Options

- **Resample in real time to the device rate** (as DAWs and show-control software do): it always plays, but it is never bit-exact on a mismatch and it adds work to the audio thread.
- **Resample once at load time into RAM**: it always plays at no playback cost, but it is never bit-exact on a mismatch and loading takes longer.

## Consequences

- Large diffusion systems often have a fixed clock (a digital desk over MADI, ADAT or Dante, or other software sharing the interface), where switching the device rate is impossible. On such systems 0.1.0 can only play Sources already at the system's rate.
- **Planned direction:** try to switch the device first. If that fails, or a "keep device rate" preference is on, resample the Source once at load with a high-quality resampler (r8brain-free, MIT). The performer always sees which one happened ("Bit-exact" or "Resampled 44.1→48 kHz"), never silently.
