#pragma once

#include "Follow.h"

#include <juce_core/juce_core.h>

namespace diffuscore
{
/** How Follow moves the Visible Range in one mode. Each mode has its own (ADR-0004). */
struct FollowPreferences
{
    FollowStyle style = FollowStyle::pageTurn;

    /** Where the Playhead stays across the width with continuous scrolling (0 = left edge, 1 = right edge),
        between Follow::minPlayheadFraction and Follow::maxPlayheadFraction. */
    double playheadFraction = Follow::defaultPlayheadFraction;
};

/** The performer's choices of how DiffuScore behaves where it is a matter of practice (ADR-0004),
    each with a default that serves a new performer without touching anything. */
struct Preferences
{
    /** Follow in Editor mode: page turn by default. Performance mode gets its own when it exists. */
    FollowPreferences editor;
};

/** Reads the Preferences from the app's settings, using the default for any that is missing or not valid. */
Preferences readPreferences (const juce::PropertySet& settings);

/** Writes the Preferences to the app's settings; save them afterwards. */
void writePreferences (const Preferences& preferences, juce::PropertySet& settings);
} // namespace diffuscore
