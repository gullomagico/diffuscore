#pragma once

#include "VisibleRange.h"

#include <juce_core/juce_core.h>

#include <functional>

namespace diffuscore
{
/** The spacing of the time ruler: a labelled tick every so many seconds, with minorDivisions intervals between labels. */
struct RulerStep
{
    double seconds = 1.0;
    int minorDivisions = 1;

    /** Labels less than a second apart read m:ss.d rather than m:ss. */
    bool showsTenths() const noexcept { return seconds < 1.0; }
};

/** The smallest step in the series 0.1 s, 0.2 s, 0.5 s, 1 s, 2 s, 5 s, 10 s, 30 s, 1 min, 2 min, 5 min, 10 min…
    that leaves room for every label when the Visible Range spans width. roomForLabel gives the room a label
    needs, in the same units as width, from its tick to the next tick; the latest time in the Visible Range,
    formatted as that step would show it, stands for the widest label. */
RulerStep chooseRulerStep (const VisibleRange& range,
                           double width,
                           const std::function<double (const juce::String& label)>& roomForLabel);

/** A time on the ruler as m:ss, or m:ss.d when the labels are less than a second apart (withTenths). */
juce::String formatRulerTime (double seconds, bool withTenths);
} // namespace diffuscore
