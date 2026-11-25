#include "Follow.h"

namespace diffuscore
{
Follow::Follow (FollowStyle followStyle)
    : style (followStyle)
{
}

void Follow::switchOn (VisibleRange& range, double playheadTime)
{
    switchOn();
    followPlayhead (range, playheadTime);
}

void Follow::followPlayhead (VisibleRange& range, double playheadTime) const
{
    if (! on)
        return;

    switch (style)
    {
        case FollowStyle::pageTurn:
        {
            const auto isOnNextPage = playheadTime >= range.getEnd() && playheadTime < range.getEnd() + range.getLength();

            if (isOnNextPage)
                range.move (range.getLength()); // keeps the pages aligned, however far past the edge the Playhead is
            else if (! range.contains (playheadTime))
                range.moveStartTo (playheadTime);

            break;
        }
    }
}
} // namespace diffuscore
