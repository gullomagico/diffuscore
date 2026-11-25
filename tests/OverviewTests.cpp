#include <catch2/catch_test_macros.hpp>
#include <catch2/matchers/catch_matchers_floating_point.hpp>

#include <Overview.h>

using namespace diffuscore;
using Catch::Matchers::WithinAbs;

namespace
{
// A 600 s Source on a 600 px Overview: 1 s per pixel. The Spectrogram is 960 px wide on a 1920 px
// display, so the deepest Zoom shows 5 s.
constexpr double overviewWidth = 600.0;

VisibleRange showing (double start, double end)
{
    VisibleRange range (600.0, 960.0, 1920.0);
    range.zoom (600.0 / (end - start), 0.0);
    range.moveStartTo (start);
    return range;
}
} // namespace

TEST_CASE ("The mark spans the Visible Range across the Overview", "[overview]")
{
    const auto mark = markVisibleRange (showing (150.0, 300.0), overviewWidth, 8.0);
    CHECK_THAT (mark.left, WithinAbs (150.0, 1e-9));
    CHECK_THAT (mark.right, WithinAbs (300.0, 1e-9));
}

TEST_CASE ("Zoomed out to the whole Source, the mark covers the whole Overview", "[overview]")
{
    const auto mark = markVisibleRange (VisibleRange (600.0, 960.0, 1920.0), overviewWidth, 8.0);
    CHECK_THAT (mark.left, WithinAbs (0.0, 1e-9));
    CHECK_THAT (mark.right, WithinAbs (600.0, 1e-9));
}

TEST_CASE ("A mark narrower than the minimum widens around its centre, within the Overview", "[overview]")
{
    SECTION ("In the middle")
    {
        const auto mark = markVisibleRange (showing (300.0, 305.0), overviewWidth, 8.0);
        CHECK_THAT (mark.left, WithinAbs (298.5, 1e-9));
        CHECK_THAT (mark.right, WithinAbs (306.5, 1e-9));
    }

    SECTION ("At the start")
    {
        const auto mark = markVisibleRange (showing (0.0, 5.0), overviewWidth, 8.0);
        CHECK_THAT (mark.left, WithinAbs (0.0, 1e-9));
        CHECK_THAT (mark.right, WithinAbs (8.0, 1e-9));
    }

    SECTION ("At the end")
    {
        const auto mark = markVisibleRange (showing (595.0, 600.0), overviewWidth, 8.0);
        CHECK_THAT (mark.left, WithinAbs (592.0, 1e-9));
        CHECK_THAT (mark.right, WithinAbs (600.0, 1e-9));
    }
}

TEST_CASE ("Dragging the mark moves the Visible Range with the mouse, stopping at the ends of the Source", "[overview]")
{
    auto range = showing (150.0, 300.0);
    const OverviewDrag drag (range, 200.0, overviewWidth, 8.0);

    CHECK_THAT (range.getStart(), WithinAbs (150.0, 1e-9)); // pressing on the mark leaves it where it is

    drag.dragTo (range, 250.0);
    CHECK_THAT (range.getStart(), WithinAbs (200.0, 1e-9));
    CHECK_THAT (range.getEnd(), WithinAbs (350.0, 1e-9));

    drag.dragTo (range, 1000.0);
    CHECK_THAT (range.getStart(), WithinAbs (450.0, 1e-9));
    CHECK_THAT (range.getEnd(), WithinAbs (600.0, 1e-9));

    drag.dragTo (range, -500.0);
    CHECK_THAT (range.getStart(), WithinAbs (0.0, 1e-9));
    CHECK_THAT (range.getEnd(), WithinAbs (150.0, 1e-9));

    drag.dragTo (range, 180.0); // back to where it was grabbed, 50 px into the mark
    CHECK_THAT (range.getStart(), WithinAbs (130.0, 1e-9));
}

TEST_CASE ("Pressing outside the mark centres the Visible Range there, stopping at the ends of the Source", "[overview]")
{
    SECTION ("In the middle, then dragging carries on from the new place")
    {
        auto range = showing (150.0, 300.0);
        const OverviewDrag drag (range, 400.0, overviewWidth, 8.0);
        CHECK_THAT (range.getStart(), WithinAbs (325.0, 1e-9));
        CHECK_THAT (range.getEnd(), WithinAbs (475.0, 1e-9));

        drag.dragTo (range, 410.0);
        CHECK_THAT (range.getStart(), WithinAbs (335.0, 1e-9));
    }

    SECTION ("Near the end")
    {
        auto range = showing (150.0, 300.0);
        const OverviewDrag drag (range, 590.0, overviewWidth, 8.0);
        CHECK_THAT (range.getStart(), WithinAbs (450.0, 1e-9));
        CHECK_THAT (range.getEnd(), WithinAbs (600.0, 1e-9));
    }

    SECTION ("Near the start")
    {
        auto range = showing (150.0, 300.0);
        const OverviewDrag drag (range, 20.0, overviewWidth, 8.0);
        CHECK_THAT (range.getStart(), WithinAbs (0.0, 1e-9));
        CHECK_THAT (range.getEnd(), WithinAbs (150.0, 1e-9));
    }
}

TEST_CASE ("Pressing on a mark widened to the minimum grabs it rather than centring", "[overview]")
{
    auto range = showing (300.0, 305.0); // marked from 298.5 to 306.5
    const OverviewDrag drag (range, 306.0, overviewWidth, 8.0);
    CHECK_THAT (range.getStart(), WithinAbs (300.0, 1e-9));

    drag.dragTo (range, 316.0);
    CHECK_THAT (range.getStart(), WithinAbs (310.0, 1e-9));
}
