#pragma once

#include <Spectrogram.h>
#include <VisibleRange.h>

#include <juce_graphics/juce_graphics.h>

namespace diffuscore
{
/** Draws the analysed levels over this range of the Source into an image of this size, in physical pixels.
    Each pixel shows the loudest level among the columns and rows it covers. */
juce::Image renderSpectrogramImage (const Spectrogram& analysed, const VisibleRange& range, int width, int height);
} // namespace diffuscore
