#include "Transport.h"

namespace diffuscore
{
void Transport::setSource (const Source* newSource)
{
    source = newSource;
    playing = false;
    position = 0;
    pendingSeek = noSeek;
}

void Transport::play() noexcept
{
    if (source == nullptr || getLength() == 0)
        return;

    // render() publishes the end position before it stops playing there, so a stopped Transport at the end is seen as such.
    if (! isPlaying() && getPosition() >= getLength())
        seek (0);

    playing = true;
}

void Transport::pause() noexcept
{
    playing = false;
}

void Transport::togglePlayPause() noexcept
{
    if (isPlaying())
        pause();
    else
        play();
}

void Transport::stop() noexcept
{
    playing = false;
    seek (0);
}

void Transport::seek (juce::int64 frame) noexcept
{
    pendingSeek = juce::jlimit ((juce::int64) 0, getLength(), frame);
}

juce::int64 Transport::getPosition() const noexcept
{
    const auto seekTo = pendingSeek.load();
    return seekTo != noSeek ? seekTo : position.load();
}

void Transport::render (float* const* outputs, int numOutputs, int numSamples) noexcept
{
    for (int output = 0; output < numOutputs; ++output)
        if (outputs[output] != nullptr)
            juce::FloatVectorOperations::clear (outputs[output], numSamples);

    auto frame = position.load();

    if (const auto seekTo = pendingSeek.exchange (noSeek); seekTo != noSeek)
        frame = seekTo;

    if (source == nullptr || ! playing.load())
    {
        position = frame;
        return;
    }

    const auto length = getLength();

    if (frame >= length) // a jump to the very end while playing: stop there
    {
        position = frame;
        playing = false;
        return;
    }

    const auto numFrames = (int) std::min ((juce::int64) numSamples, length - frame);
    const auto lastChannel = source->getNumChannels() - 1;

    for (int output = 0; output < std::min (numOutputs, 2); ++output)
        if (outputs[output] != nullptr)
            juce::FloatVectorOperations::copy (outputs[output],
                                               source->samples.getReadPointer (std::min (output, lastChannel), (int) frame),
                                               numFrames);

    frame += numFrames;
    position = frame;

    if (frame >= length)
        playing = false;
}
} // namespace diffuscore
