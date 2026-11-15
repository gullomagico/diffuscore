# Source samples in a SharedArrayBuffer; the app requires cross-origin isolation

The decoded Source lives in `SharedArrayBuffer`s, so the main thread, the analysis worker and, later, a playback `AudioWorklet` all read one copy. This requires the page to be **cross-origin isolated**, so every environment must serve:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

The Vite+ dev and preview servers set these headers. When `crossOriginIsolated` is false the app shows a blocking "deployment misconfigured" message instead of the workspace. **There is no fallback storage path**, because maintaining two code paths isn't worth it when every target browser supports isolation.

## Considered Options

- **Transfer the samples into the worker** (one copy, no header requirement): playback would later have to fetch audio back from the worker.
- **Copy to both threads**: trivial playback later, but it doubles steady-state memory (about 1.4 GB for 30 min) and breaks the import's safety limits.

## Consequences

- **Hosting is undecided, but constrained:** the host must be able to send custom response headers. Netlify, Vercel and Cloudflare Pages can. Plain GitHub Pages can't without the `coi-serviceworker` workaround.
- **External resources:** every cross-origin resource (scripts, fonts, images, iframes) must send CORP/CORS headers or be self-hosted. Today everything is same-origin (fonts come bundled through `@fontsource`).
- **Memory peak during import:** `decodeAudioData` returns a non-shared `AudioBuffer`, so its channels are copied into the shared buffers before the `AudioBuffer` is released. Together with the encoded file held during decode, a 30-minute Source briefly takes well over 1.4 GB, then settles at about 690 MB. The import limits (1 GB file, 30 min) are provisional until this is measured in Chrome, Firefox and Safari.
- **Sources are always decoded at 48 kHz**, whatever the file's rate. This bounds memory and keeps analysis parameters stable. We accept the resampling because DiffuScore's playback will be a reference for rehearsal and score editing, not the concert source, and Web Audio resamples to the output device's rate anyway. The rate is written once, in the import, and everything downstream reads it from the Source.
