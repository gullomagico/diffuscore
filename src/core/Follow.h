#pragma once

#include "VisibleRange.h"

namespace diffuscore
{
/** How the Visible Range moves to keep the Playhead in view. */
enum class FollowStyle
{
    /** When the Playhead reaches the right edge, the Visible Range jumps one full screen forward. */
    pageTurn,
    /** The Playhead stays at a fixed fraction of the width while the Visible Range moves under it,
        except near the start and end of the Source, where the Visible Range stops and the Playhead moves. */
    continuousScrolling
};

/** Follow: the Visible Range keeping the Playhead in view while the Transport plays.

    Follow is on until a scroll or zoom by hand switches it off; only the performer switches it back on.
    While on, followPlayhead() moves the Visible Range in the chosen style. With page turn, it moves whenever
    the Playhead leaves it: one page forward when it reaches the right edge, or, after a jump elsewhere, to put
    it at the left edge. With continuous scrolling, it moves on every call to keep the Playhead at the chosen
    fraction of the width, jumps included. Every move stops at the start and end of the Source. */
class Follow
{
public:
    static constexpr double defaultPlayheadFraction = 1.0 / 3.0;
    static constexpr double minPlayheadFraction = 0.1;
    static constexpr double maxPlayheadFraction = 0.9;

    /** playheadFraction is where the Playhead stays across the width (0 = left edge, 1 = right edge)
        with continuous scrolling, kept between minPlayheadFraction and maxPlayheadFraction. */
    explicit Follow (FollowStyle style, double playheadFraction = defaultPlayheadFraction);

    bool isOn() const noexcept { return on; }

    /** Takes effect from the next followPlayhead(). */
    void setStyle (FollowStyle newStyle) noexcept { style = newStyle; }

    /** Takes effect from the next followPlayhead(); kept between minPlayheadFraction and maxPlayheadFraction. */
    void setPlayheadFraction (double fraction) noexcept;

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
    double playheadFraction = defaultPlayheadFraction;
    bool on = true;
};
} // namespace diffuscore
