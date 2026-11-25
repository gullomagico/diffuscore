#include <catch2/catch_test_macros.hpp>
#include <catch2/matchers/catch_matchers_floating_point.hpp>

#include <VisibleRange.h>

using namespace diffuscore;
using Catch::Matchers::WithinAbs;

namespace
{
// A 960 px view on a 1920 px display: 10 s per display width, so the deepest Zoom shows 5 s.
constexpr double viewWidth = 960.0;
constexpr double displayWidth = 1920.0;
} // namespace

TEST_CASE ("A new Visible Range shows the whole Source", "[visible range]")
{
    const VisibleRange range (600.0, viewWidth, displayWidth);

    CHECK_THAT (range.getStart(), WithinAbs (0.0, 1e-9));
    CHECK_THAT (range.getEnd(), WithinAbs (600.0, 1e-9));
}

TEST_CASE ("Zooming around an anchor keeps the anchor at the same position in the view", "[visible range]")
{
    VisibleRange range (600.0, viewWidth, displayWidth);

    // 150 s is a quarter of the way across; zooming in 2x around it shows 75 s to 375 s.
    range.zoom (2.0, 150.0);
    CHECK_THAT (range.getStart(), WithinAbs (75.0, 1e-9));
    CHECK_THAT (range.getEnd(), WithinAbs (375.0, 1e-9));
    CHECK_THAT (range.fractionOf (150.0), WithinAbs (0.25, 1e-9));

    // And back out by 1.5x: 450 s wide, 150 s still a quarter of the way across.
    range.zoom (1.0 / 1.5, 150.0);
    CHECK_THAT (range.getStart(), WithinAbs (37.5, 1e-9));
    CHECK_THAT (range.getEnd(), WithinAbs (487.5, 1e-9));
    CHECK_THAT (range.timeAt (0.25), WithinAbs (150.0, 1e-9));
}

TEST_CASE ("The Visible Range never extends before the start or past the end of the Source", "[visible range]")
{
    VisibleRange range (600.0, viewWidth, displayWidth);
    range.zoom (10.0, 300.0); // 60 s wide: 270 s to 330 s

    SECTION ("Moving stops at the start")
    {
        range.move (-1000.0);
        CHECK_THAT (range.getStart(), WithinAbs (0.0, 1e-9));
        CHECK_THAT (range.getEnd(), WithinAbs (60.0, 1e-9));
    }

    SECTION ("Moving stops at the end")
    {
        range.move (1000.0);
        CHECK_THAT (range.getStart(), WithinAbs (540.0, 1e-9));
        CHECK_THAT (range.getEnd(), WithinAbs (600.0, 1e-9));
    }

    SECTION ("Moving within the Source moves by the amount")
    {
        range.move (-20.0);
        CHECK_THAT (range.getStart(), WithinAbs (250.0, 1e-9));
        CHECK_THAT (range.getEnd(), WithinAbs (310.0, 1e-9));
    }

    SECTION ("Zooming out near the start stays within the Source")
    {
        range.move (-1000.0);
        range.zoom (0.5, 50.0); // 120 s wide would start at -50 s
        CHECK_THAT (range.getStart(), WithinAbs (0.0, 1e-9));
        CHECK_THAT (range.getEnd(), WithinAbs (120.0, 1e-9));
    }

    SECTION ("Zooming out near the end stays within the Source")
    {
        range.move (1000.0);
        range.zoom (0.5, 590.0); // 120 s wide would end at 610 s
        CHECK_THAT (range.getStart(), WithinAbs (480.0, 1e-9));
        CHECK_THAT (range.getEnd(), WithinAbs (600.0, 1e-9));
    }
}

TEST_CASE ("Zoom stops at the whole Source and at the deepest limit", "[visible range]")
{
    SECTION ("Zooming out stops at the whole Source")
    {
        VisibleRange range (600.0, viewWidth, displayWidth);
        range.zoom (4.0, 100.0);
        range.zoom (0.001, 100.0);
        CHECK_THAT (range.getStart(), WithinAbs (0.0, 1e-9));
        CHECK_THAT (range.getEnd(), WithinAbs (600.0, 1e-9));
    }

    SECTION ("Zooming in stops at 10 s per display width: 5 s for half the display")
    {
        VisibleRange range (600.0, viewWidth, displayWidth);
        range.zoom (1000.0, 300.0);
        CHECK_THAT (range.getEnd() - range.getStart(), WithinAbs (5.0, 1e-9));
        CHECK_THAT (range.fractionOf (300.0), WithinAbs (0.5, 1e-9));
    }

    SECTION ("A view as wide as the display reaches 10 s")
    {
        VisibleRange range (600.0, 2560.0, 2560.0);
        range.zoom (1000.0, 300.0);
        CHECK_THAT (range.getEnd() - range.getStart(), WithinAbs (10.0, 1e-9));
    }

    SECTION ("A Source shorter than the deepest limit can't be zoomed into")
    {
        VisibleRange range (3.0, viewWidth, displayWidth);
        range.zoom (2.0, 1.0);
        CHECK_THAT (range.getStart(), WithinAbs (0.0, 1e-9));
        CHECK_THAT (range.getEnd(), WithinAbs (3.0, 1e-9));
    }

    SECTION ("Resizing narrower keeps the Visible Range, and lets the next zoom go deeper")
    {
        VisibleRange range (600.0, viewWidth, displayWidth);
        range.zoom (1000.0, 300.0); // 5 s wide: 297.5 s to 302.5 s

        range.setWidths (480.0, displayWidth); // deepest is now 2.5 s
        CHECK_THAT (range.getStart(), WithinAbs (297.5, 1e-9));
        CHECK_THAT (range.getEnd(), WithinAbs (302.5, 1e-9));

        range.zoom (1000.0, 300.0);
        CHECK_THAT (range.getEnd() - range.getStart(), WithinAbs (2.5, 1e-9));
    }

    SECTION ("Resizing wider re-applies the deepest limit around the centre")
    {
        VisibleRange range (600.0, viewWidth, displayWidth);
        range.zoom (1000.0, 300.0); // 5 s wide: 297.5 s to 302.5 s

        range.setWidths (1920.0, displayWidth); // deepest is now 10 s
        CHECK_THAT (range.getStart(), WithinAbs (295.0, 1e-9));
        CHECK_THAT (range.getEnd(), WithinAbs (305.0, 1e-9));
    }
}

TEST_CASE ("Zooming out to the whole Source shows the whole Source", "[visible range]")
{
    VisibleRange range (600.0, viewWidth, displayWidth);
    range.zoom (50.0, 420.0);
    range.zoomOutToWholeSource();

    CHECK_THAT (range.getStart(), WithinAbs (0.0, 1e-9));
    CHECK_THAT (range.getEnd(), WithinAbs (600.0, 1e-9));
}

TEST_CASE ("Zooming around the Playhead uses the centre when the Playhead is off screen", "[visible range]")
{
    VisibleRange range (600.0, viewWidth, displayWidth);
    range.zoom (6.0, 300.0); // 100 s wide: 250 s to 350 s

    SECTION ("Playhead in the Visible Range: it stays where it is in the view")
    {
        range.zoomAroundPlayhead (2.0, 275.0); // a quarter across: 50 s wide, 262.5 s to 312.5 s
        CHECK_THAT (range.getStart(), WithinAbs (262.5, 1e-9));
        CHECK_THAT (range.getEnd(), WithinAbs (312.5, 1e-9));
    }

    SECTION ("Playhead outside the Visible Range: around the centre")
    {
        range.zoomAroundPlayhead (2.0, 10.0);
        CHECK_THAT (range.getStart(), WithinAbs (275.0, 1e-9));
        CHECK_THAT (range.getEnd(), WithinAbs (325.0, 1e-9));
    }

    SECTION ("No Playhead: around the centre")
    {
        range.zoomAroundPlayhead (2.0, std::nullopt);
        CHECK_THAT (range.getStart(), WithinAbs (275.0, 1e-9));
        CHECK_THAT (range.getEnd(), WithinAbs (325.0, 1e-9));
    }
}
