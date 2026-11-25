#include <catch2/catch_test_macros.hpp>
#include <catch2/matchers/catch_matchers_floating_point.hpp>

#include <Preferences.h>

using namespace diffuscore;
using Catch::Matchers::WithinAbs;

TEST_CASE ("A fresh install's Preferences: page turn in Editor mode, the Playhead at one third for continuous scrolling", "[preferences]")
{
    const juce::PropertySet empty;
    const auto preferences = readPreferences (empty);

    CHECK (preferences.editor.style == FollowStyle::pageTurn);
    CHECK_THAT (preferences.editor.playheadFraction, WithinAbs (1.0 / 3.0, 1e-9));
}

TEST_CASE ("Preferences survive being saved and read back", "[preferences]")
{
    Preferences chosen;
    chosen.editor.style = FollowStyle::continuousScrolling;
    chosen.editor.playheadFraction = 0.6;

    juce::PropertySet settings;
    writePreferences (chosen, settings);
    const auto readBack = readPreferences (settings);

    CHECK (readBack.editor.style == FollowStyle::continuousScrolling);
    CHECK_THAT (readBack.editor.playheadFraction, WithinAbs (0.6, 1e-9));
}

TEST_CASE ("Preferences that are not valid in the settings are replaced by a valid value", "[preferences]")
{
    juce::PropertySet settings;

    SECTION ("An unknown follow style: page turn")
    {
        settings.setValue ("editorFollowStyle", "spiral");
        CHECK (readPreferences (settings).editor.style == FollowStyle::pageTurn);
    }

    SECTION ("A Playhead position off the 10–90% range: the nearest limit")
    {
        settings.setValue ("editorPlayheadFraction", 1.5);
        CHECK_THAT (readPreferences (settings).editor.playheadFraction, WithinAbs (0.9, 1e-9));

        settings.setValue ("editorPlayheadFraction", -2.0);
        CHECK_THAT (readPreferences (settings).editor.playheadFraction, WithinAbs (0.1, 1e-9));
    }
}
