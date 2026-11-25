#pragma once

#include "VisibleRange.h"

namespace diffuscore
{
/** How the Visible Range moves to keep the Playhead in view. */
enum class FollowStyle
{
    /** When the Playhead reaches the right edge, the Visible Range jumps one full screen forward. */
    pageTurn
};

/** Follow: the Visible Range keeping the Playhead in view while the Transport plays.

    Follow is on until a scroll or zoom by hand switches it off; only the performer switches it back on.
    While on, followPlayhead() moves the Visible Range in the chosen style whenever the Playhead leaves it:
    one page forward when it reaches the right edge, or, after a jump elsewhere, to put it at the left edge.
    Every move stops at the start and end of the Source. */
class Follow
{
public:
    explicit Follow (FollowStyle style);

    bool isOn() const noexcept { return on; }

    /** Switches Follow on and brings the Playhead (seconds in the Source) into view at once. */
    void switchOn (VisibleRange& range, double playheadTime);

    /** Switches Follow on when there is no Playhead or Visible Range to bring into view yet. */
    void switchOn() noexcept { on = true; }

    /** For a scroll or zoom by hand: the Visible Range stays where the performer put it. */
    void switchOff() noexcept { on = false; }

    /** Moves the Visible Range, if Follow is on, to keep the Playhead (seconds in the Source) in view.
        Call it whenever the Playhead moves. */
    void followPlayhead (VisibleRange& range, double playheadTime) const;

private:
    FollowStyle style;
    bool on = true;
};
} // namespace diffuscore
