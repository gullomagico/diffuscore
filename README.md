# DiffuScore

DiffuScore is a desktop application for creating, editing and performing personalized sound diffusion scores for acousmatic music.

Designed for performers working with loudspeaker orchestras (acousmonia), DiffuScore shows a visual representation of a fixed stereo piece on which the performer builds their diffusion score, and plays the piece to the diffusion desk during the concert.

## Stack

- C++20, [JUCE](https://juce.com) 9, CMake
- [Catch2](https://github.com/catchorg/Catch2) v3 for unit tests
- Developed on Linux; Windows and macOS builds are planned

## Build

On Debian or Ubuntu, install a compiler, CMake, Ninja, Git and the libraries JUCE needs:

```sh
sudo apt update
sudo apt install build-essential cmake ninja-build git pkg-config \
    libasound2-dev libjack-jackd2-dev \
    libfreetype-dev libfontconfig1-dev \
    libx11-dev libxcomposite-dev libxcursor-dev libxext-dev \
    libxinerama-dev libxrandr-dev libxrender-dev libxi-dev
```

(On Ubuntu 20.04 and older, use `libfreetype6-dev` instead of `libfreetype-dev`.)

Then configure, build and run the tests with the CMake presets in `CMakePresets.json`, which use the Ninja generator (JUCE and Catch2 are downloaded on the first configure):

```sh
cmake --preset debug
cmake --build --preset debug
ctest --preset debug
```

The app is built at `build/src/app/DiffuScore_artefacts/Debug/DiffuScore`; run it with `./build/src/app/DiffuScore_artefacts/Debug/DiffuScore`. JUCE's sources need about 2 GB of RAM per compiler job: on a machine with little memory, limit the parallel jobs, e.g. `cmake --build --preset debug -j2`.

### Release build

The build above is a Debug build: slow, with assertions and checks, for development. To try DiffuScore at full speed (for example, to judge how smoothly the Spectrogram scrolls), use the `release` preset, which builds in `build-release`:

```sh
cmake --preset release
cmake --build --preset release
ctest --preset release
```

The app is built at `build-release/src/app/DiffuScore_artefacts/Release/DiffuScore`. There is also a `relwithdebinfo` preset (optimised, with debug info, in `build-relwithdebinfo`) for profiling.

The first configure of each preset downloads JUCE and Catch2 again. To reuse the copies already in `build`, add `-DFETCHCONTENT_SOURCE_DIR_JUCE=$PWD/build/_deps/juce-src -DFETCHCONTENT_SOURCE_DIR_CATCH2=$PWD/build/_deps/catch2-src` to the first command, or set them once in a local `CMakeUserPresets.json` (ignored by Git):

```json
{
  "version": 3,
  "configurePresets": [
    {
      "name": "release-local",
      "displayName": "Release (reuse build/_deps)",
      "inherits": "release",
      "cacheVariables": {
        "FETCHCONTENT_SOURCE_DIR_JUCE": "${sourceDir}/build/_deps/juce-src",
        "FETCHCONTENT_SOURCE_DIR_CATCH2": "${sourceDir}/build/_deps/catch2-src"
      }
    }
  ]
}
```

and configure with `cmake --preset release-local`; it shares `build-release`, so `cmake --build --preset release` still works.

### In VS Code

With the CMake Tools extension, pick the configure preset (Debug or Release) from the status bar, then use Build, Run or Debug with `DiffuScore` as the launch target. Debugging needs the C/C++ extension or CodeLLDB.

## License

[AGPL-3.0](https://www.gnu.org/licenses/agpl-3.0.html), as required by JUCE's open-source license.
