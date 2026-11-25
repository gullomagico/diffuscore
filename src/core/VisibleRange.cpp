#include "VisibleRange.h"

#include <algorithm>

namespace diffuscore
{
VisibleRange::VisibleRange (double duration, double initialViewWidth, double initialDisplayWidth)
    : sourceDuration (std::max (0.0, duration))
    , viewWidth (initialViewWidth)
    , displayWidth (initialDisplayWidth)
    , length (sourceDuration)
{
}

double VisibleRange::getDeepestLength() const noexcept
{
    if (viewWidth <= 0.0 || displayWidth <= 0.0)
        return sourceDuration; // no width known yet: nothing to zoom into

    return std::min (sourceDuration, deepestSecondsPerDisplayWidth * viewWidth / displayWidth);
}

void VisibleRange::setWidths (double newViewWidth, double newDisplayWidth)
{
    viewWidth = newViewWidth;
    displayWidth = newDisplayWidth;

    if (length < getDeepestLength())
        setLengthAround (getDeepestLength(), timeAt (0.5));
}

void VisibleRange::zoom (double factor, double anchorTime)
{
    if (factor > 0.0)
        setLengthAround (length / factor, anchorTime);
}

void VisibleRange::zoomAroundPlayhead (double factor, std::optional<double> playheadTime)
{
    zoom (factor, playheadTime.has_value() && contains (*playheadTime) ? *playheadTime : timeAt (0.5));
}

void VisibleRange::move (double seconds)
{
    start += seconds;
    keepWithinSource();
}

void VisibleRange::setLengthAround (double newLength, double anchorTime)
{
    const auto anchorFraction = fractionOf (anchorTime);
    length = std::clamp (newLength, getDeepestLength(), sourceDuration);
    start = anchorTime - anchorFraction * length;
    keepWithinSource();
}

void VisibleRange::keepWithinSource()
{
    start = std::clamp (start, 0.0, std::max (0.0, sourceDuration - length));
}
} // namespace diffuscore
