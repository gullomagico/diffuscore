#include "Spectrogram.h"

#include <juce_dsp/juce_dsp.h>

#include <cmath>

namespace diffuscore
{
namespace
{
using namespace spectrogram;

constexpr int numBins = fftSize / 2 + 1; // DC to Nyquist

/** The mel scale (O'Shaughnessy's formula): roughly linear below 700 Hz and logarithmic above. */
double frequencyToMel (double frequency)
{
    return 2595.0 * std::log10 (1.0 + frequency / 700.0);
}

double melToFrequency (double mel)
{
    return 700.0 * (std::pow (10.0, mel / 2595.0) - 1.0);
}

double lowestMel() { return frequencyToMel (lowestFrequency); }
double highestMel() { return frequencyToMel (highestFrequency); }

double rowEdgeFrequency (int rowEdge)
{
    return melToFrequency (lowestMel() + (highestMel() - lowestMel()) * rowEdge / numRows);
}

/** The FFT bins a row takes its level from: those whose centre lies in the row's band, or, when the band
    is narrower than a bin, the bin nearest to the band's centre. Rows above Nyquist have no bins. A row's
    level is the mean power of its bins, so wide rows high up are not brightened relative to narrow ones. */
struct RowBins
{
    int first = 0;
    int last = -1; // inclusive; last < first means no bins
};

std::vector<RowBins> binsForRows (double sampleRate)
{
    std::vector<RowBins> rows ((size_t) numRows);

    if (sampleRate <= 0.0)
        return rows;

    const auto binWidth = sampleRate / fftSize;

    for (int row = 0; row < numRows; ++row)
    {
        const auto low = rowEdgeFrequency (row);
        const auto high = rowEdgeFrequency (row + 1);
        auto& bins = rows[(size_t) row];

        bins.first = (int) std::ceil (low / binWidth);
        bins.last = std::min ((int) std::ceil (high / binWidth) - 1, numBins - 1);

        if (bins.last < bins.first)
        {
            const auto nearest = (int) std::round (std::sqrt (low * high) / binWidth);

            if (nearest < numBins)
                bins.first = bins.last = nearest;
        }
    }

    return rows;
}

/** A full-scale sine through a Hann window peaks at a magnitude of fftSize / 4: that power is 0 dBFS. */
float powerToDb (double power)
{
    constexpr double fullScalePower = (fftSize / 4.0) * (fftSize / 4.0);
    const auto db = power > 0.0 ? 10.0 * std::log10 (power / fullScalePower) : (double) floorDb;
    return juce::jlimit (floorDb, ceilingDb, (float) db);
}
} // namespace

std::optional<Spectrogram> analyseSpectrogram (const Source& source, const SpectrogramProgressCallback& onProgress)
{
    const auto length = (int) source.getLengthInFrames();
    const auto numChannels = source.getNumChannels();

    // Frame f is centred on the middle of the hop [f * hopSize, (f + 1) * hopSize), zero-padded past the ends.
    const auto numFrames = std::max (1, (length + hopSize - 1) / hopSize);

    Spectrogram result;
    result.numColumns = numFrames;
    result.secondsPerColumn = source.sampleRate > 0.0 ? hopSize / source.sampleRate : 0.0;
    result.numRows = numRows;
    result.levels.resize ((size_t) result.numColumns * (size_t) numRows);

    const auto rowBins = binsForRows (source.sampleRate);

    juce::dsp::FFT fft (fftOrder);
    juce::dsp::WindowingFunction<float> hann ((size_t) fftSize, juce::dsp::WindowingFunction<float>::hann, false);
    std::vector<float> fftData ((size_t) fftSize * 2);
    std::vector<double> binPowers ((size_t) numBins);

    for (int frame = 0; frame < numFrames; ++frame)
    {
        const auto start = frame * hopSize + hopSize / 2 - fftSize / 2;
        const auto first = std::max (0, start);
        const auto end = std::min (length, start + fftSize);
        std::fill (binPowers.begin(), binPowers.end(), 0.0);

        for (int channel = 0; channel < numChannels; ++channel)
        {
            std::fill (fftData.begin(), fftData.end(), 0.0f);

            if (end > first)
                std::copy (source.samples.getReadPointer (channel, first),
                           source.samples.getReadPointer (channel, first) + (end - first),
                           fftData.begin() + (first - start));

            hann.multiplyWithWindowingTable (fftData.data(), (size_t) fftSize);
            fft.performFrequencyOnlyForwardTransform (fftData.data(), true);

            for (int bin = 0; bin < numBins; ++bin)
                binPowers[(size_t) bin] += (double) fftData[(size_t) bin] * fftData[(size_t) bin];
        }

        for (int row = 0; row < numRows; ++row)
        {
            const auto bins = rowBins[(size_t) row];
            double power = 0.0;

            for (int bin = bins.first; bin <= bins.last; ++bin)
                power += binPowers[(size_t) bin];

            if (bins.last >= bins.first)
                power /= bins.last - bins.first + 1;

            result.levels[(size_t) frame * numRows + (size_t) row] = powerToDb (power);
        }

        if (onProgress && ! onProgress ((double) (frame + 1) / numFrames))
            return std::nullopt;
    }

    return result;
}

int spectrogramRowForFrequency (double frequency)
{
    if (frequency <= lowestFrequency)
        return 0;

    const auto position = (frequencyToMel (frequency) - lowestMel()) / (highestMel() - lowestMel());
    return juce::jlimit (0, numRows - 1, (int) std::floor (position * numRows));
}
} // namespace diffuscore
