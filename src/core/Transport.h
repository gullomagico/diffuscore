#pragma once

#include "Source.h"

#include <atomic>

namespace diffuscore
{
/** Plays a Source to the first two outputs of an audio callback, bit-exact (ADR-0002): stereo L and R
    go to outputs 1 and 2, mono goes to both, every other output is silent. No gain, no processing.

    play(), togglePlayPause(), stop() and seek() are called from the message thread, render() from the
    audio thread; pause() from either. They share only lock-free atomics, and render() never allocates or locks.
    At the end of the Source, playback stops there; the next play() starts again from the beginning. */
class Transport
{
public:
    /** Stops, and puts this Source (nullptr for none) at its start.
        Not thread-safe: call it only while render() can't be running, e.g. with the audio callback removed. */
    void setSource (const Source* newSource);

    /** Plays from the position, or from the beginning when stopped at the end. Does nothing without a Source. */
    void play() noexcept;

    /** Stops playing and holds the position. */
    void pause() noexcept;

    void togglePlayPause() noexcept;

    /** Pauses and returns to the start of the Source. */
    void stop() noexcept;

    /** Jumps to this frame, clamped to the Source, playing or not. */
    void seek (juce::int64 frame) noexcept;

    bool isPlaying() const noexcept { return playing.load(); }

    /** The frame the next render() plays from, including a seek that render() hasn't reached yet. */
    juce::int64 getPosition() const noexcept;

    /** Fills the outputs with the next numSamples frames of the Source, or silence when not playing. */
    void render (float* const* outputs, int numOutputs, int numSamples) noexcept;

private:
    static constexpr juce::int64 noSeek = -1;

    juce::int64 getLength() const noexcept { return source != nullptr ? source->getLengthInFrames() : 0; }

    const Source* source = nullptr;
    std::atomic<bool> playing { false };
    std::atomic<juce::int64> position { 0 };      // written only by render() (and setSource())
    std::atomic<juce::int64> pendingSeek { noSeek }; // written by seek(), taken by render()

    static_assert (std::atomic<juce::int64>::is_always_lock_free);
    static_assert (std::atomic<bool>::is_always_lock_free);
};
} // namespace diffuscore
