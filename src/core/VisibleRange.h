#pragma once

#include <optional>

namespace diffuscore
{
/** The stretch of the Source, in seconds from its start, that the Spectrogram shows.

    It always lies within the Source, and its length is kept between two limits: the shallowest Zoom
    shows the whole Source; the deepest shows deepestSecondsPerDisplayWidth across the full width of
    the display, so a view half the display's width reaches half that duration. */
class VisibleRange
{
public:
    static constexpr double deepestSecondsPerDisplayWidth = 10.0;

    /** The whole Source, for a view viewWidth wide on a display displayWidth wide (both in the same units). */
    VisibleRange (double sourceDuration, double viewWidth, double displayWidth);

    double getStart() const noexcept { return start; }
    double getEnd() const noexcept { return start + length; }
    double getLength() const noexcept { return length; }
    /** After a resize or a move to another display: keeps the Visible Range, but widens it around its
        centre if it is now shorter than the deepest limit. */
    void setWidths (double viewWidth, double displayWidth);

    /** Zooms in by this factor (below 1 zooms out), keeping anchorTime at the same position in the view. */
    void zoom (double factor, double anchorTime);

    /** Zooms around the Playhead (seconds in the Source), or around the centre of the Visible Range
        when the Playhead is outside it or absent. */
    void zoomAroundPlayhead (double factor, std::optional<double> playheadTime);

    bool contains (double time) const noexcept { return time >= start && time <= getEnd(); }

    bool operator== (const VisibleRange&) const = default;

    void zoomOutToWholeSource() noexcept { start = 0.0; length = sourceDuration; }

    /** Moves by this many seconds (negative = towards the start), stopping at the start and end of the Source. */
    void move (double seconds);

    /** Moves so it starts at this time, keeping its length, stopping at the start and end of the Source. */
    void moveStartTo (double time);

    /** Moves so its centre is at this time, keeping its length, stopping at the start and end of the Source. */
    void centreOn (double time) { moveStartTo (time - length / 2.0); }

    double getSourceDuration() const noexcept { return sourceDuration; }

    /** The time at this fraction of the view's width (0 = left edge, 1 = right edge). */
    double timeAt (double fractionOfView) const noexcept { return start + fractionOfView * length; }

    /** Where this time lies across the view (0 = left edge, 1 = right edge; outside [0, 1] when off screen). */
    double fractionOf (double time) const noexcept { return length > 0.0 ? (time - start) / length : 0.0; }

private:
    /** The shortest Visible Range allowed at the current widths (the whole Source, if that is shorter). */
    double getDeepestLength() const noexcept;
    void setLengthAround (double newLength, double anchorTime);
    void keepWithinSource();

    double sourceDuration = 0.0;
    double viewWidth = 0.0;
    double displayWidth = 0.0;
    double start = 0.0;
    double length = 0.0;
};
} // namespace diffuscore
