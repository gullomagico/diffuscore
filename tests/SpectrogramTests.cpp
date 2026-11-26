#include <catch2/catch_test_macros.hpp>
#include <catch2/matchers/catch_matchers_floating_point.hpp>

#include <Spectrogram.h>

#include <algorithm>
#include <cmath>

using namespace diffuscore;
using Catch::Matchers::WithinULP; // WithinULP (x, 0) is a bit-exact comparison

TEST_CASE ("The frequency axis maps 20 Hz and 20 kHz to the first and last rows", "[spectrogram]")
{
    CHECK (spectrogramRowForFrequency (20.0) == 0);
    CHECK (spectrogramRowForFrequency (20000.0) == spectrogram::numRows - 1);
}

TEST_CASE ("The frequency axis is mel-spaced", "[spectrogram]")
{
    // On the mel scale, 1 kHz is exactly 1000 mel; 20 Hz and 20 kHz are about 31.0 and 3816.8 mel.
    const auto expected = (int) ((1000.0 - 31.0) / (3816.8 - 31.0) * spectrogram::numRows);
    CHECK (std::abs (spectrogramRowForFrequency (1000.0) - expected) <= 1);

    // Mel spacing is near-linear low down: 20-700 Hz takes about a fifth of the rows, not half as on a log axis.
    CHECK (spectrogramRowForFrequency (700.0) < spectrogram::numRows / 4);
}

namespace
{
constexpr double sampleRate = 48000.0;

Source makeSource (int numChannels, double seconds)
{
    Source source;
    source.fileName = "generated.wav";
    source.sampleRate = sampleRate;
    source.samples.setSize (numChannels, (int) (seconds * sampleRate));
    source.samples.clear();
    return source;
}

void writeSine (Source& source, int channel, double frequency, float amplitude)
{
    auto* samples = source.samples.getWritePointer (channel);

    for (int i = 0; i < source.samples.getNumSamples(); ++i)
        samples[i] = amplitude * (float) std::sin (juce::MathConstants<double>::twoPi * frequency * i / sampleRate);
}

void writeWhiteNoise (Source& source, int channel, float amplitude)
{
    juce::Random random (1234);
    auto* samples = source.samples.getWritePointer (channel);

    for (int i = 0; i < source.samples.getNumSamples(); ++i)
        samples[i] = amplitude * (2.0f * random.nextFloat() - 1.0f);
}

/** The mean power across all columns of the rows from one frequency to another, in dB. */
double meanLevelDb (const Spectrogram& spectrogram, double lowFrequency, double highFrequency)
{
    double power = 0.0;
    int count = 0;

    for (int row = spectrogramRowForFrequency (lowFrequency); row <= spectrogramRowForFrequency (highFrequency); ++row)
        for (int column = 0; column < spectrogram.numColumns; ++column, ++count)
            power += std::pow (10.0, spectrogram.getLevel (column, row) / 10.0);

    return 10.0 * std::log10 (power / count);
}

int loudestRow (const Spectrogram& spectrogram, int column)
{
    int loudest = 0;

    for (int row = 1; row < spectrogram.numRows; ++row)
        if (spectrogram.getLevel (column, row) > spectrogram.getLevel (column, loudest))
            loudest = row;

    return loudest;
}
} // namespace

TEST_CASE ("A 1 kHz sine is loudest in the row containing 1 kHz", "[spectrogram]")
{
    auto source = makeSource (1, 5.0);
    writeSine (source, 0, 1000.0, 0.5f);

    const auto spectrogram = analyseSpectrogram (source);
    REQUIRE (spectrogram.has_value());
    REQUIRE (spectrogram->numColumns > 0);
    REQUIRE (spectrogram->numRows == spectrogram::numRows);

    for (int column = 0; column < spectrogram->numColumns; ++column)
        CHECK (loudestRow (*spectrogram, column) == spectrogramRowForFrequency (1000.0));
}

TEST_CASE ("White noise is as bright in wide high rows as in narrow low ones", "[spectrogram]")
{
    // A row spanning many bins must not read louder just because it has more bins to choose from.
    auto source = makeSource (1, 10.0);
    writeWhiteNoise (source, 0, 0.5f);

    const auto spectrogram = analyseSpectrogram (source);
    REQUIRE (spectrogram.has_value());

    const auto low = meanLevelDb (*spectrogram, 400.0, 600.0);    // about one bin per row
    const auto high = meanLevelDb (*spectrogram, 15000.0, 18000.0); // several bins per row
    CHECK (std::abs (high - low) < 1.0);
}

TEST_CASE ("Silence is at the bottom of the dB range everywhere", "[spectrogram]")
{
    const auto source = makeSource (2, 3.0);

    const auto spectrogram = analyseSpectrogram (source);
    REQUIRE (spectrogram.has_value());
    REQUIRE_FALSE (spectrogram->levels.empty());

    const auto [quietest, loudest] = std::minmax_element (spectrogram->levels.begin(), spectrogram->levels.end());
    CHECK_THAT (*quietest, WithinULP (-100.0f, 0));
    CHECK_THAT (*loudest, WithinULP (-100.0f, 0));
}

TEST_CASE ("A stereo Source with L = -R still shows its energy", "[spectrogram]")
{
    auto source = makeSource (2, 3.0);
    writeSine (source, 0, 1000.0, 0.5f);
    writeSine (source, 1, 1000.0, -0.5f);

    const auto spectrogram = analyseSpectrogram (source);
    REQUIRE (spectrogram.has_value());

    const auto row = spectrogramRowForFrequency (1000.0);

    for (int column = 0; column < spectrogram->numColumns; ++column)
    {
        CHECK (loudestRow (*spectrogram, column) == row);
        CHECK (spectrogram->getLevel (column, row) > -20.0f);
    }
}

TEST_CASE ("The analysis reports its progress up to 1 and can be stopped", "[spectrogram]")
{
    auto source = makeSource (1, 10.0);
    writeSine (source, 0, 1000.0, 0.5f);

    SECTION ("Progress rises to 1")
    {
        std::vector<double> reported;
        const auto spectrogram = analyseSpectrogram (source, [&] (double progress)
                                                     {
                                                         reported.push_back (progress);
                                                         return true;
                                                     });
        REQUIRE (spectrogram.has_value());
        REQUIRE_FALSE (reported.empty());
        CHECK (std::is_sorted (reported.begin(), reported.end()));
        CHECK_THAT (reported.back(), WithinULP (1.0, 0));
    }

    SECTION ("Returning false stops the analysis")
    {
        int calls = 0;
        const auto spectrogram = analyseSpectrogram (source, [&] (double)
                                                     {
                                                         ++calls;
                                                         return false;
                                                     });
        CHECK_FALSE (spectrogram.has_value());
        CHECK (calls == 1);
    }
}

TEST_CASE ("The Spectrogram has one column per analysis frame, however long the Source", "[spectrogram]")
{
    // 9000 hops: more analysis frames than the former cap of 8192 columns allowed.
    Source source;
    source.fileName = "long.wav";
    source.sampleRate = sampleRate;
    source.samples.setSize (1, 9000 * spectrogram::hopSize);
    source.samples.clear();

    const auto spectrogram = analyseSpectrogram (source);
    REQUIRE (spectrogram.has_value());
    CHECK (spectrogram->numColumns == 9000);
    CHECK_THAT (spectrogram->secondsPerColumn, WithinULP (2048.0 / 48000.0, 0));
}
