# DiffuScore

DiffuScore is a desktop application for creating, editing and performing personalized sound diffusion scores for acousmatic music.

Designed for performers working with loudspeaker orchestras (acousmonia), DiffuScore shows a visual representation of a fixed stereo piece on which the performer builds their diffusion score, and plays the piece to the diffusion desk during the concert.

## Stack

- C++20, [JUCE](https://juce.com) 9, CMake
- [Catch2](https://github.com/catchorg/Catch2) v3 for unit tests
- Developed on Linux; Windows and macOS builds are planned

## Build

On Debian or Ubuntu, install a compiler, CMake, Git and the libraries JUCE needs:

```sh
sudo apt update
sudo apt install build-essential cmake git pkg-config \
    libasound2-dev libjack-jackd2-dev \
    libfreetype-dev libfontconfig1-dev \
    libx11-dev libxcomposite-dev libxcursor-dev libxext-dev \
    libxinerama-dev libxrandr-dev libxrender-dev libxi-dev
```

(On Ubuntu 20.04 and older, use `libfreetype6-dev` instead of `libfreetype-dev`.)

Then configure, build and run the tests (JUCE and Catch2 are downloaded on the first configure):

```sh
cmake -B build
cmake --build build
ctest --test-dir build
```

The app is built at `build/src/app/DiffuScore_artefacts/Debug/DiffuScore`. JUCE's sources need about 2 GB of RAM per compiler job: on a machine with little memory, limit the parallel jobs, e.g. `cmake --build build -j2`.

## License

[AGPL-3.0](https://www.gnu.org/licenses/agpl-3.0.html), as required by JUCE's open-source license.
