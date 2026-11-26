# The Spectrogram's frequency axis is mel-spaced, with rows at mean power

The Spectrogram's rows are spaced evenly in mel (`m = 2595 · log10(1 + f / 700)`) from 20 Hz to 20 kHz, and each row's level is the mean power of the FFT bins in its band.

A log-spaced axis gave 20–700 Hz about half the height, but a 4096-point FFT (about 11 Hz per bin) has only a few dozen bins there, so the lower half was stretched into dark, stair-stepped blocks while the busy mid and high range was squeezed. Mel is close to linear below 700 Hz and logarithmic above, so 20–700 Hz takes about a fifth of the height, with fewer rows narrower than one bin, and material reads more like it does in other acousmonium tools.

Rows used to take the loudest of their bins. A row spanning many bins (high up) then read louder for noise-like material than a one-bin row (low down), by about 4 dB at 15–18 kHz for white noise, which tilted the picture towards the highs. The mean removes that bias.

## Considered Options

- **Log-spaced axis**: equal height per octave, best for low-register pitch detail, but spends half the height on a range the FFT cannot resolve.
- **Linear axis**: matches some other tools, but puts everything below 1 kHz in the bottom few percent.
- **Loudest bin per row**: keeps isolated high tones crisp, but brightens wide rows.

## Consequences

- Octaves below about 700 Hz are shorter than those above, so low-register pitch detail is compressed.
- A pure tone in a wide high row is averaged with its quieter neighbouring bins, so it reads a few dB dimmer than it would with the loudest bin.
- Low-frequency resolution itself is unchanged; a multi-resolution analysis could add real detail there later.
