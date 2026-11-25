#include <catch2/catch_test_macros.hpp>
#include <catch2/matchers/catch_matchers_floating_point.hpp>

#include <TimeRuler.h>

using namespace diffuscore;
using Catch::Matchers::WithinAbs;

namespace
{
// A Visible Range showing the whole of a Source this long (no width known, so no Zoom limit applies).
VisibleRange wholeSource (double seconds)
{
    return VisibleRange (seconds, 0.0, 0.0);
}

// Every label takes this much room, whatever it reads.
auto fixedRoom (double room)
{
    return [room] (const juce::String&) { return room; };
}

// 10 px per character of the label.
double tenPixelsPerCharacter (const juce::String& label)
{
    return 10.0 * label.length();
}
} // namespace

TEST_CASE ("The ruler step is the smallest in the series that leaves room for a label", "[time ruler]")
{
    SECTION ("A 10-minute Visible Range over 1000 px with 60 px per label: 30 s would be 50 px, 1 min is 100 px")
    {
        CHECK_THAT (chooseRulerStep (wholeSource (600.0), 1000.0, fixedRoom (60.0)).seconds, WithinAbs (60.0, 1e-9));
    }

    SECTION ("A 30-minute Source zoomed out over 1000 px with 80 px per label: 2 min would be 67 px, 5 min is 167 px")
    {
        CHECK_THAT (chooseRulerStep (wholeSource (1800.0), 1000.0, fixedRoom (80.0)).seconds, WithinAbs (300.0, 1e-9));
    }

    SECTION ("A 5-second Visible Range over 1000 px with 60 px per label: 0.2 s would be 40 px, 0.5 s is 100 px")
    {
        CHECK_THAT (chooseRulerStep (wholeSource (5.0), 1000.0, fixedRoom (60.0)).seconds, WithinAbs (0.5, 1e-9));
    }

    SECTION ("A step whose labels are exactly the room they need apart fits")
    {
        CHECK_THAT (chooseRulerStep (wholeSource (10.0), 1000.0, fixedRoom (100.0)).seconds, WithinAbs (1.0, 1e-9));
    }

    SECTION ("When even 0.1 s leaves room, 0.1 s is the step")
    {
        CHECK_THAT (chooseRulerStep (wholeSource (2.0), 2000.0, fixedRoom (60.0)).seconds, WithinAbs (0.1, 1e-9));
    }

    SECTION ("Between 10 s and 1 min the series goes through 30 s, not 20 s")
    {
        // 20 s would be 66.7 px and fit; the series skips it.
        CHECK_THAT (chooseRulerStep (wholeSource (300.0), 1000.0, fixedRoom (60.0)).seconds, WithinAbs (30.0, 1e-9));
    }

    SECTION ("The room is that of the latest label, with tenths when the step is under a second")
    {
        // 10 s over 1000 px: 100 px per second. Without tenths "0:10" needs 40 px, so 0.5 s (50 px) would fit;
        // but at 0.5 s the labels read "0:10.0", 60 px, so 0.5 s doesn't fit and the step is 1 s.
        CHECK_THAT (chooseRulerStep (wholeSource (10.0), 1000.0, tenPixelsPerCharacter).seconds, WithinAbs (1.0, 1e-9));

        // Over 1500 px, 0.5 s is 75 px: room for "0:10.0".
        CHECK_THAT (chooseRulerStep (wholeSource (10.0), 1500.0, tenPixelsPerCharacter).seconds, WithinAbs (0.5, 1e-9));
    }

    SECTION ("However long the Source, labels never overlap")
    {
        // 100 hours over 200 px with 100 px per label: only a step of 50 hours or more leaves room.
        CHECK (chooseRulerStep (wholeSource (360000.0), 200.0, fixedRoom (100.0)).seconds >= 180000.0);
    }
}

TEST_CASE ("Ruler times read m:ss, with tenths when needed", "[time ruler]")
{
    CHECK (formatRulerTime (0.0, false) == "0:00");
    CHECK (formatRulerTime (65.0, false) == "1:05");
    CHECK (formatRulerTime (750.0, false) == "12:30");
    CHECK (formatRulerTime (4.5, true) == "0:04.5");

    SECTION ("Tick times that land just off a tenth still read as that tenth")
    {
        CHECK (formatRulerTime (45 * 0.1, true) == "0:04.5");
        CHECK (formatRulerTime (59.99999, true) == "1:00.0");
        CHECK (formatRulerTime (119.9999999, false) == "2:00");
    }

    SECTION ("Past an hour the minutes keep counting")
    {
        CHECK (formatRulerTime (3725.0, false) == "62:05");
    }
}
