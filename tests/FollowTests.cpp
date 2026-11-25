#include <catch2/catch_test_macros.hpp>
#include <catch2/matchers/catch_matchers_floating_point.hpp>

#include <Follow.h>

using namespace diffuscore;
using Catch::Matchers::WithinAbs;

namespace
{
// A 960 px view on a 1920 px display: the deepest Zoom shows 5 s.
constexpr double viewWidth = 960.0;
constexpr double displayWidth = 1920.0;

/** A 600 s Source zoomed in to 60 s, starting at startSeconds. */
VisibleRange zoomedRange (double startSeconds)
{
    VisibleRange range (600.0, viewWidth, displayWidth);
    range.zoom (10.0, 0.0);
    range.moveStartTo (startSeconds);
    return range;
}
} // namespace

TEST_CASE ("With Follow on, a Playhead reaching the right edge turns the page by one Visible Range width", "[follow]")
{
    const Follow follow (FollowStyle::pageTurn);
    auto range = zoomedRange (120.0); // 120 s to 180 s

    SECTION ("Exactly at the right edge")
    {
        follow.followPlayhead (range, 180.0);
        CHECK_THAT (range.getStart(), WithinAbs (180.0, 1e-9));
        CHECK_THAT (range.getEnd(), WithinAbs (240.0, 1e-9));
    }

    SECTION ("Just past it, as between two timer ticks: pages stay aligned")
    {
        follow.followPlayhead (range, 180.03);
        CHECK_THAT (range.getStart(), WithinAbs (180.0, 1e-9));
        CHECK_THAT (range.getEnd(), WithinAbs (240.0, 1e-9));
    }
}

TEST_CASE ("With Follow on, the last page is clamped to the end of the Source", "[follow]")
{
    const Follow follow (FollowStyle::pageTurn);
    auto range = zoomedRange (520.0); // 520 s to 580 s; a full page would reach 640 s

    follow.followPlayhead (range, 580.0);
    CHECK_THAT (range.getStart(), WithinAbs (540.0, 1e-9));
    CHECK_THAT (range.getEnd(), WithinAbs (600.0, 1e-9));

    // The Playhead reaching the end of the Source moves it no further.
    follow.followPlayhead (range, 600.0);
    CHECK_THAT (range.getStart(), WithinAbs (540.0, 1e-9));
    CHECK_THAT (range.getEnd(), WithinAbs (600.0, 1e-9));
}

TEST_CASE ("With Follow on, a jump outside the Visible Range brings the Playhead into view at the left edge", "[follow]")
{
    const Follow follow (FollowStyle::pageTurn);
    auto range = zoomedRange (120.0); // 120 s to 180 s

    SECTION ("Back to the start, as Stop does")
    {
        follow.followPlayhead (range, 0.0);
        CHECK_THAT (range.getStart(), WithinAbs (0.0, 1e-9));
        CHECK_THAT (range.getEnd(), WithinAbs (60.0, 1e-9));
    }

    SECTION ("Earlier in the Source")
    {
        follow.followPlayhead (range, 50.0);
        CHECK_THAT (range.getStart(), WithinAbs (50.0, 1e-9));
        CHECK_THAT (range.getEnd(), WithinAbs (110.0, 1e-9));
    }

    SECTION ("More than a page later")
    {
        follow.followPlayhead (range, 400.0);
        CHECK_THAT (range.getStart(), WithinAbs (400.0, 1e-9));
        CHECK_THAT (range.getEnd(), WithinAbs (460.0, 1e-9));
    }

    SECTION ("Near the end: clamped to the end of the Source")
    {
        follow.followPlayhead (range, 590.0);
        CHECK_THAT (range.getStart(), WithinAbs (540.0, 1e-9));
        CHECK_THAT (range.getEnd(), WithinAbs (600.0, 1e-9));
    }
}

TEST_CASE ("With Follow on, a Playhead within the Visible Range leaves it where it is", "[follow]")
{
    const Follow follow (FollowStyle::pageTurn);
    auto range = zoomedRange (120.0);

    follow.followPlayhead (range, 120.0);
    follow.followPlayhead (range, 179.9);
    CHECK_THAT (range.getStart(), WithinAbs (120.0, 1e-9));
    CHECK_THAT (range.getEnd(), WithinAbs (180.0, 1e-9));
}

TEST_CASE ("Follow starts on", "[follow]")
{
    CHECK (Follow (FollowStyle::pageTurn).isOn());
}

TEST_CASE ("With Follow off, the Visible Range never moves on its own", "[follow]")
{
    Follow follow (FollowStyle::pageTurn);
    follow.switchOff();
    auto range = zoomedRange (120.0);

    for (const auto playhead : { 180.0, 200.0, 0.0, 400.0, 600.0 })
        follow.followPlayhead (range, playhead);

    CHECK_FALSE (follow.isOn());
    CHECK_THAT (range.getStart(), WithinAbs (120.0, 1e-9));
    CHECK_THAT (range.getEnd(), WithinAbs (180.0, 1e-9));
}

TEST_CASE ("Switching Follow on brings the Playhead into view at once", "[follow]")
{
    Follow follow (FollowStyle::pageTurn);
    follow.switchOff(); // a scroll or zoom by hand
    auto range = zoomedRange (120.0);

    SECTION ("A Playhead out of view")
    {
        follow.switchOn (range, 400.0);
        CHECK (follow.isOn());
        CHECK_THAT (range.getStart(), WithinAbs (400.0, 1e-9));
        CHECK_THAT (range.getEnd(), WithinAbs (460.0, 1e-9));

        // And following resumes.
        follow.followPlayhead (range, 460.0);
        CHECK_THAT (range.getStart(), WithinAbs (460.0, 1e-9));
    }

    SECTION ("With nothing to bring into view yet, as before a Source's Spectrogram is ready")
    {
        follow.switchOn();
        CHECK (follow.isOn());
        follow.followPlayhead (range, 400.0);
        CHECK_THAT (range.getStart(), WithinAbs (400.0, 1e-9));
    }

    SECTION ("A Playhead already in view")
    {
        follow.switchOn (range, 150.0);
        CHECK (follow.isOn());
        CHECK_THAT (range.getStart(), WithinAbs (120.0, 1e-9));
    }
}
