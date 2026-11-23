# JUCE desktop app, not web or Electron

DiffuScore is used on stage: during an acousmonium concert it is the player that sends the fixed piece to the diffusion desk, while the performer reads their Score. Audio output must be glitch-free and bit-exact, so DiffuScore is a native C++20 desktop application built on JUCE with CMake, targeting Linux, Windows and macOS. Development happens on Linux; other platforms come with the first release.

JUCE's open-source license is AGPLv3, so DiffuScore is licensed AGPLv3. That is acceptable while it is a university project; a commercial JUCE license would be needed to change it.

## Considered Options

- **Web app** (the first prototype: React, Web Audio, Canvas): the browser owns the audio thread, the output device and the sample rate, and there is no guarantee against dropouts from garbage collection, tab throttling or other pages. Not reliable enough to be the concert source.
- **Electron**: the same browser audio stack inside a desktop shell, so it inherits the same limits.
