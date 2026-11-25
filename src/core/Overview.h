#pragma once

#include "VisibleRange.h"

namespace diffuscore
{
/** Where the Visible Range is marked across the Overview, from its left edge to its right edge, in the units
    of the Overview's width. */
struct OverviewMark
{
    double left = 0.0;
    double right = 0.0;

    bool contains (double x) const noexcept { return x >= left && x <= right; }
};

/** The mark for this Visible Range on an Overview overviewWidth wide, showing the whole Source. A mark narrower
    than minimumWidth widens around its centre, staying within the Overview, so it can still be seen and grabbed. */
OverviewMark markVisibleRange (const VisibleRange& range, double overviewWidth, double minimumWidth);

/** A press on the Overview, from the mouse going down until it is released. Pressing on the mark grabs it;
    pressing elsewhere first centres the Visible Range on that point, then grabs it there. Dragging moves the Visible Range
    with the mouse, keeping the point grabbed under it, and stops at the start and end of the Source. */
class OverviewDrag
{
public:
    /** The mouse going down at x on an Overview overviewWidth wide, marked with this minimum width
        (see markVisibleRange). */
    OverviewDrag (VisibleRange& range, double x, double overviewWidth, double minimumMarkWidth);

    /** The mouse dragged to x, anywhere (even beyond the Overview's edges). */
    void dragTo (VisibleRange& range, double x) const;

private:
    double timeAt (double x) const noexcept { return x * secondsPerUnit; }

    double secondsPerUnit = 0.0;
    double grabOffset = 0.0; // seconds from the start of the Visible Range to the time grabbed
};
} // namespace diffuscore
