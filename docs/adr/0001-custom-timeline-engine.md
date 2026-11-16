# Custom timeline engine with focused DSP dependencies

The Timeline (waveforms, spectrograms, and later annotations and the playhead) is rendered by our own engine instead of an audio-visualisation library. The engine is plain TypeScript with no React inside: it owns the Viewport, a min/max peak pyramid, and the STFT analysis in a Web Worker, and it draws to Canvas2D outside React's render cycle (`requestAnimationFrame`). React reads engine state through `useSyncExternalStore`. The only DSP dependency is `fft.js` (MIT).

We chose this because DiffuScore's core is a shared time↔pixel mapping on which audio Lanes and graphical annotations coexist, and because the default Overlay Preset composites a Mirrored waveform over a Total spectrogram. Any off-the-shelf library would own exactly the parts we need to control.

## Considered Options

- **wavesurfer.js v7**: fastest to a first render and brings playback for free, but it owns its DOM (Shadow DOM), its scroll container and the time↔pixel mapping. Its spectrogram renders in a separate container, so the Overlay Preset would mean fighting it, and its FFT runs on the main thread.
- **peaks.js + waveform-data.js (BBC)**: built for long files, but has no spectrogram and adds Konva as a second rendering model. Both are **LGPL-3.0**. LGPL in a bundled web app brings relinking and notice obligations and constrains how DiffuScore can be licensed later, which is why we also don't use waveform-data.js on its own: the peak pyramid is a small, pure min/max reduction we write ourselves.
- **Fully custom, including the FFT**: no benefit over a well-tested MIT FFT.

## Consequences

- **Spectrograms are an overview plus tiles, not a full precompute.** With a 4096-point Hann window (about 85 ms, chosen for bass resolution: 11.7 Hz bins at 48 kHz), useful time resolution caps at about 128 columns/s. A full precompute of a 30-minute Source at that cap is about 118 MB per spectrogram (about 354 MB for L, R and Total) and about 26 s of FFT work (measured at about 56 µs per window+FFT+power frame). Instead:
  - the import's Analyzing stage computes max-pooled overview spectrograms at 10 columns/s (FFT every 2048 samples, about 5 s for 30 min, about 28 MB for all three) plus the full peak pyramid
  - zooming in requests detail tiles (512 columns at 32, 64 or 128 columns/s, about 58 ms each) from the worker, with neighbouring tiles computed ahead and a 64 MB LRU cache
  - until a detail tile is ready, the nearest coarser image is drawn stretched in its place
- Spectrogram data is stored as quantised dB (`Uint8`) and coloured through a lookup table, so colormap and dB-range changes never need new FFTs. The renderer sits behind an interface so it can later be swapped for WebGL.
- The frequency axis (logarithmic, 20 Hz to 24 kHz, 512 rows) is fixed when the analysis runs: changing it, for example to a linear axis, needs new FFTs.
- We own HiDPI handling, tile caching, cursor-anchored zoom, worker messaging and, later, playhead sync.
