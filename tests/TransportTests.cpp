#include <catch2/catch_test_macros.hpp>

#include <Transport.h>

#include <cstring>

using namespace diffuscore;

namespace
{
constexpr double sampleRate = 48000.0;

/** A Source whose every sample is distinct, so any shift, gain or Channel swap shows up. */
Source makeSource (int numChannels, int lengthInFrames)
{
    Source source;
    source.fileName = "generated.wav";
    source.sampleRate = sampleRate;
    source.samples.setSize (numChannels, lengthInFrames);

    for (int channel = 0; channel < numChannels; ++channel)
        for (int frame = 0; frame < lengthInFrames; ++frame)
            source.samples.setSample (channel, frame, (float) (channel + 1) * 0.001f + (float) frame * 1.0e-6f);

    return source;
}

/** Renders one block into a buffer of numOutputs channels, pre-filled with garbage so silence must be written. */
juce::AudioBuffer<float> renderBlock (Transport& transport, int numOutputs, int numSamples)
{
    juce::AudioBuffer<float> outputs (numOutputs, numSamples);

    for (int channel = 0; channel < numOutputs; ++channel)
        juce::FloatVectorOperations::fill (outputs.getWritePointer (channel), 0.5f, numSamples);

    transport.render (outputs.getArrayOfWritePointers(), numOutputs, numSamples);
    return outputs;
}

/** True if output[i] is the very same float as channel[firstFrame + i], for every sample of the output. */
bool isBitExactCopy (const juce::AudioBuffer<float>& outputs, int output, const Source& source, int channel, int firstFrame)
{
    for (int i = 0; i < outputs.getNumSamples(); ++i)
        if (std::memcmp (outputs.getReadPointer (output) + i, source.samples.getReadPointer (channel) + firstFrame + i, sizeof (float)) != 0)
            return false;

    return true;
}

bool isSilent (const juce::AudioBuffer<float>& outputs, int output, int firstSample = 0)
{
    for (int i = firstSample; i < outputs.getNumSamples(); ++i)
        if (! juce::exactlyEqual (outputs.getSample (output, i), 0.0f))
            return false;

    return true;
}
} // namespace

TEST_CASE ("A stopped Transport renders silence and stays at the start", "[transport]")
{
    const auto source = makeSource (2, 1000);
    Transport transport;
    transport.setSource (&source);

    const auto outputs = renderBlock (transport, 2, 256);

    CHECK_FALSE (transport.isPlaying());
    CHECK (transport.getPosition() == 0);
    CHECK (isSilent (outputs, 0));
    CHECK (isSilent (outputs, 1));
}

TEST_CASE ("Playing copies a stereo Source to outputs 1 and 2 sample-for-sample, other outputs silent", "[transport]")
{
    const auto source = makeSource (2, 1000);
    Transport transport;
    transport.setSource (&source);
    transport.play();

    const auto first = renderBlock (transport, 4, 256);
    const auto second = renderBlock (transport, 4, 256);

    CHECK (transport.isPlaying());
    CHECK (transport.getPosition() == 512);
    CHECK (isBitExactCopy (first, 0, source, 0, 0));
    CHECK (isBitExactCopy (first, 1, source, 1, 0));
    CHECK (isBitExactCopy (second, 0, source, 0, 256));
    CHECK (isBitExactCopy (second, 1, source, 1, 256));
    CHECK (isSilent (first, 2));
    CHECK (isSilent (first, 3));
}

TEST_CASE ("Playing copies a mono Source to both outputs 1 and 2 sample-for-sample", "[transport]")
{
    const auto source = makeSource (1, 1000);
    Transport transport;
    transport.setSource (&source);
    transport.play();

    const auto outputs = renderBlock (transport, 3, 256);

    CHECK (isBitExactCopy (outputs, 0, source, 0, 0));
    CHECK (isBitExactCopy (outputs, 1, source, 0, 0));
    CHECK (isSilent (outputs, 2));
}

TEST_CASE ("Pausing holds the position, and playing again resumes from it", "[transport]")
{
    const auto source = makeSource (2, 1000);
    Transport transport;
    transport.setSource (&source);
    transport.play();
    renderBlock (transport, 2, 100);

    transport.togglePlayPause();
    const auto paused = renderBlock (transport, 2, 100);

    CHECK_FALSE (transport.isPlaying());
    CHECK (transport.getPosition() == 100);
    CHECK (isSilent (paused, 0));

    transport.togglePlayPause();
    const auto resumed = renderBlock (transport, 2, 100);

    CHECK (transport.isPlaying());
    CHECK (isBitExactCopy (resumed, 0, source, 0, 100));
    CHECK (transport.getPosition() == 200);
}

TEST_CASE ("Stop returns to the start, and the next Play starts from there", "[transport]")
{
    const auto source = makeSource (2, 1000);
    Transport transport;
    transport.setSource (&source);
    transport.play();
    renderBlock (transport, 2, 300);

    transport.stop();

    CHECK_FALSE (transport.isPlaying());
    CHECK (transport.getPosition() == 0);
    CHECK (isSilent (renderBlock (transport, 2, 100), 0));

    transport.play();
    CHECK (isBitExactCopy (renderBlock (transport, 2, 100), 0, source, 0, 0));
}

TEST_CASE ("Seeking jumps there, playing or stopped", "[transport]")
{
    const auto source = makeSource (2, 1000);
    Transport transport;
    transport.setSource (&source);

    SECTION ("While stopped, the position shows the jump at once and Play starts from it")
    {
        transport.seek (400);
        CHECK (transport.getPosition() == 400);
        CHECK_FALSE (transport.isPlaying());

        transport.play();
        CHECK (isBitExactCopy (renderBlock (transport, 2, 100), 1, source, 1, 400));
    }

    SECTION ("While playing, the next block plays from the jump")
    {
        transport.play();
        renderBlock (transport, 2, 100);

        transport.seek (700);
        const auto outputs = renderBlock (transport, 2, 100);

        CHECK (transport.isPlaying());
        CHECK (isBitExactCopy (outputs, 0, source, 0, 700));
        CHECK (transport.getPosition() == 800);
    }

    SECTION ("A jump to the very end while playing stops there, without starting again")
    {
        transport.play();
        renderBlock (transport, 2, 100);

        transport.seek (1000);
        const auto outputs = renderBlock (transport, 2, 100);

        CHECK_FALSE (transport.isPlaying());
        CHECK (transport.getPosition() == 1000);
        CHECK (isSilent (outputs, 0));
    }

    SECTION ("A jump outside the Source is clamped to it")
    {
        transport.seek (-50);
        CHECK (transport.getPosition() == 0);

        transport.seek (5000);
        CHECK (transport.getPosition() == 1000);
    }
}

TEST_CASE ("At the end, playback stops there, and the next Play starts from the beginning", "[transport]")
{
    const auto source = makeSource (2, 1000);
    Transport transport;
    transport.setSource (&source);
    transport.seek (900);
    transport.play();

    const auto lastBlock = renderBlock (transport, 2, 256);

    CHECK_FALSE (transport.isPlaying());
    CHECK (transport.getPosition() == 1000);
    CHECK (isSilent (lastBlock, 0, 100));
    CHECK (isSilent (lastBlock, 1, 100));

    juce::AudioBuffer<float> firstHundred (2, 100);
    firstHundred.copyFrom (0, 0, lastBlock, 0, 0, 100);
    CHECK (isBitExactCopy (firstHundred, 0, source, 0, 900));

    CHECK (isSilent (renderBlock (transport, 2, 256), 0)); // stays stopped at the end
    CHECK (transport.getPosition() == 1000);

    transport.play();
    const auto restarted = renderBlock (transport, 2, 256);

    CHECK (transport.isPlaying());
    CHECK (isBitExactCopy (restarted, 0, source, 0, 0));
    CHECK (transport.getPosition() == 256);
}

TEST_CASE ("An empty Source never plays", "[transport]")
{
    const auto source = makeSource (2, 0);
    Transport transport;
    transport.setSource (&source);
    transport.play();

    CHECK (isSilent (renderBlock (transport, 2, 64), 0));
    CHECK_FALSE (transport.isPlaying());
}

TEST_CASE ("Without a Source, Play does nothing and the output is silent", "[transport]")
{
    Transport transport;
    transport.play();

    CHECK_FALSE (transport.isPlaying());
    CHECK (isSilent (renderBlock (transport, 2, 64), 0));
}
