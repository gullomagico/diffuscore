#pragma once

#include <juce_audio_basics/juce_audio_basics.h>

namespace diffuscore
{
/** The PCM audio a Score is built on, decoded into RAM at its native sample rate (ADR-0002, ADR-0003). */
struct Source
{
    juce::String fileName;
    double sampleRate = 0.0;
    juce::AudioBuffer<float> samples; // one buffer channel per Channel, one sample per frame

    int getNumChannels() const { return samples.getNumChannels(); }
    juce::int64 getLengthInFrames() const { return samples.getNumSamples(); }
    double getDurationSeconds() const { return sampleRate > 0.0 ? (double) getLengthInFrames() / sampleRate : 0.0; }
};
} // namespace diffuscore
