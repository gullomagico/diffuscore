#include "Preferences.h"

#include <algorithm>
#include <cmath>

namespace diffuscore
{
namespace
{
const juce::String pageTurnValue = "pageTurn";
const juce::String continuousScrollingValue = "continuousScrolling";

/** Settings keys for one mode's Follow: "<mode>FollowStyle" and "<mode>PlayheadFraction". */
struct FollowKeys
{
    explicit FollowKeys (const juce::String& mode)
        : style (mode + "FollowStyle")
        , playheadFraction (mode + "PlayheadFraction")
    {
    }

    juce::String style, playheadFraction;
};

const FollowKeys editorKeys { "editor" };

FollowPreferences readFollow (const juce::PropertySet& settings, const FollowKeys& keys)
{
    FollowPreferences follow;

    if (settings.getValue (keys.style) == continuousScrollingValue)
        follow.style = FollowStyle::continuousScrolling;

    if (const auto fraction = settings.getDoubleValue (keys.playheadFraction, Follow::defaultPlayheadFraction); std::isfinite (fraction))
        follow.playheadFraction = std::clamp (fraction, Follow::minPlayheadFraction, Follow::maxPlayheadFraction);

    return follow;
}

void writeFollow (const FollowPreferences& follow, juce::PropertySet& settings, const FollowKeys& keys)
{
    settings.setValue (keys.style, follow.style == FollowStyle::continuousScrolling ? continuousScrollingValue : pageTurnValue);
    settings.setValue (keys.playheadFraction, follow.playheadFraction);
}
} // namespace

Preferences readPreferences (const juce::PropertySet& settings)
{
    Preferences preferences;
    preferences.editor = readFollow (settings, editorKeys);
    return preferences;
}

void writePreferences (const Preferences& preferences, juce::PropertySet& settings)
{
    writeFollow (preferences.editor, settings, editorKeys);
}
} // namespace diffuscore
