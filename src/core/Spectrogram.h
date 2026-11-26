#pragma once

#include "Source.h"

#include <functional>
#include <optional>
#include <vector>

namespace diffuscore
{
/** The fixed analysis and display parameters of a Spectrogram (v0.1.0 has no settings). */
namespace spectrogram
{
constexpr int fftOrder = 12;
constexpr int fftSize = 1 << fftOrder; // 4096-point Hann window
constexpr int hopSize = fftSize / 2;  // Hann windows overlapping by half cover every sample equally
constexpr int numRows = 512;           // frequency rows, mel-spaced from lowestFrequency to highestFrequency
constexpr double lowestFrequency = 20.0;
constexpr double highestFrequency = 20000.0;
constexpr float floorDb = -100.0f;
constexpr float ceilingDb = 0.0f;
} // namespace spectrogram

/** The levels of a Source over time and frequency, in dBFS clamped to [floorDb, ceilingDb].
    For stereo, each level is the sum of the two Channels' powers, so L = -R does not cancel out
    (and the same full-scale sine in both Channels reads +3 dB, clamped to 0).
    Each column is one analysis frame (one hop), and each cell the strongest FFT bin in its row's band. */
struct Spectrogram
{
    int numColumns = 0;            // left to right: the whole Source, from start to end, one per analysis frame
    double secondsPerColumn = 0.0; // column c covers [c, c + 1) * secondsPerColumn of the Source
    int numRows = 0;               // bottom to top: lowestFrequency to highestFrequency
    std::vector<float> levels;     // column by column: levels[column * numRows + row]

    float getLevel (int column, int row) const { return levels[(size_t) column * (size_t) numRows + (size_t) row]; }
};

/** Called during the analysis with the progress so far (0 to 1). Returning false stops the analysis. */
using SpectrogramProgressCallback = std::function<bool (double progress)>;

/** Analyses the whole Source, or returns nothing if onProgress stopped it. */
std::optional<Spectrogram> analyseSpectrogram (const Source& source, const SpectrogramProgressCallback& onProgress = {});

/** The row, from 0 (lowestFrequency) to numRows - 1 (highestFrequency), whose band contains this frequency.
    Frequencies outside the axis are clamped to the first or last row. */
int spectrogramRowForFrequency (double frequency);
} // namespace diffuscore
