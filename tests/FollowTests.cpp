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

TEST_CASE ("With continuous scrolling, the Playhead stays at the chosen fraction of the width", "[follow]")
{
    auto range = zoomedRange (120.0); // 120 s to 180 s

    SECTION ("One third, the default")
    {
        const Follow follow (FollowStyle::continuousScrolling);

        for (const auto playhead : { 200.0, 200.03, 300.0, 50.0 })
        {
            follow.followPlayhead (range, playhead);
            CHECK_THAT (range.fractionOf (playhead), WithinAbs (1.0 / 3.0, 1e-9));
            CHECK_THAT (range.getLength(), WithinAbs (60.0, 1e-9));
        }
    }

    SECTION ("A chosen fraction: 75%")
    {
        const Follow follow (FollowStyle::continuousScrolling, 0.75);
        follow.followPlayhead (range, 300.0);
        CHECK_THAT (range.getStart(), WithinAbs (255.0, 1e-9));
        CHECK_THAT (range.getEnd(), WithinAbs (315.0, 1e-9));
    }
}

TEST_CASE ("With continuous scrolling, near the start and end the Visible Range stops and the Playhead moves", "[follow]")
{
    const Follow follow (FollowStyle::continuousScrolling); // one third: 20 s into a 60 s Visible Range
    auto range = zoomedRange (120.0);

    SECTION ("Near the start: the Visible Range stays at the start, the Playhead left of one third")
    {
        follow.followPlayhead (range, 10.0);
        CHECK_THAT (range.getStart(), WithinAbs (0.0, 1e-9));
        CHECK_THAT (range.getEnd(), WithinAbs (60.0, 1e-9));
        CHECK_THAT (range.fractionOf (10.0), WithinAbs (10.0 / 60.0, 1e-9));
    }

    SECTION ("Near the end: the Visible Range stays at the end, the Playhead right of one third")
    {
        follow.followPlayhead (range, 570.0);
        CHECK_THAT (range.getStart(), WithinAbs (540.0, 1e-9));
        CHECK_THAT (range.getEnd(), WithinAbs (600.0, 1e-9));
        CHECK_THAT (range.fractionOf (570.0), WithinAbs (0.5, 1e-9));

        follow.followPlayhead (range, 600.0); // the end of the Source
        CHECK_THAT (range.getStart(), WithinAbs (540.0, 1e-9));
        CHECK_THAT (range.fractionOf (600.0), WithinAbs (1.0, 1e-9));
    }
}

TEST_CASE ("The style and the Playhead position can change while Follow runs", "[follow]")
{
    Follow follow (FollowStyle::pageTurn);
    auto range = zoomedRange (120.0); // 120 s to 180 s

    follow.setStyle (FollowStyle::continuousScrolling);
    follow.followPlayhead (range, 150.0);
    CHECK_THAT (range.getStart(), WithinAbs (130.0, 1e-9)); // one third

    follow.setPlayheadFraction (0.5);
    follow.followPlayhead (range, 160.0);
    CHECK_THAT (range.getStart(), WithinAbs (130.0, 1e-9));

    follow.setStyle (FollowStyle::pageTurn); // a Playhead in view: nothing moves until the right edge
    follow.followPlayhead (range, 170.0);
    CHECK_THAT (range.getStart(), WithinAbs (130.0, 1e-9));
    follow.followPlayhead (range, 190.0);
    CHECK_THAT (range.getStart(), WithinAbs (190.0, 1e-9));
}

TEST_CASE ("The Playhead position for continuous scrolling is kept between 10% and 90% of the width", "[follow]")
{
    auto range = zoomedRange (120.0);

    SECTION ("Below 10%")
    {
        const Follow follow (FollowStyle::continuousScrolling, 0.0);
        follow.followPlayhead (range, 300.0);
        CHECK_THAT (range.fractionOf (300.0), WithinAbs (0.1, 1e-9));
    }

    SECTION ("Above 90%")
    {
        Follow follow (FollowStyle::continuousScrolling);
        follow.setPlayheadFraction (1.0);
        follow.followPlayhead (range, 300.0);
        CHECK_THAT (range.fractionOf (300.0), WithinAbs (0.9, 1e-9));
    }
}
