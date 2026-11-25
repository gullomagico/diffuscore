#include "Overview.h"

#include <algorithm>

namespace diffuscore
{
OverviewMark markVisibleRange (const VisibleRange& range, double overviewWidth, double minimumWidth)
{
    const auto duration = range.getSourceDuration();

    if (duration <= 0.0 || overviewWidth <= 0.0)
        return {};

    const auto pixelsPerSecond = overviewWidth / duration;
    OverviewMark mark { range.getStart() * pixelsPerSecond, range.getEnd() * pixelsPerSecond };
    const auto width = std::min (std::max (mark.right - mark.left, minimumWidth), overviewWidth);
    const auto left = std::clamp ((mark.left + mark.right - width) / 2.0, 0.0, overviewWidth - width);
    return { left, left + width };
}

OverviewDrag::OverviewDrag (VisibleRange& range, double x, double overviewWidth, double minimumMarkWidth)
    : secondsPerUnit (overviewWidth > 0.0 ? range.getSourceDuration() / overviewWidth : 0.0)
{
    if (! markVisibleRange (range, overviewWidth, minimumMarkWidth).contains (x))
        range.centreOn (timeAt (x));

    grabOffset = timeAt (x) - range.getStart();
}

void OverviewDrag::dragTo (VisibleRange& range, double x) const
{
    range.moveStartTo (timeAt (x) - grabOffset);
}
} // namespace diffuscore
