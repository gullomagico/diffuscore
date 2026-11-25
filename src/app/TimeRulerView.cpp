#include "TimeRulerView.h"

#include <TimeRuler.h>

#include <algorithm>
#include <cmath>

namespace diffuscore
{
namespace
{
constexpr float labelGap = 3.0f;      // between a tick and its label, which sits to its right
constexpr float labelPadding = 12.0f; // the least room left between one label and the next tick
} // namespace

TimeRulerView::TimeRulerView()
{
    setInterceptsMouseClicks (false, false);
    setOpaque (true);
}

void TimeRulerView::setVisibleRange (std::optional<VisibleRange> range)
{
    if (range == visibleRange)
        return;

    visibleRange = range;
    repaint();
}

void TimeRulerView::paint (juce::Graphics& g)
{
    const auto width = (float) getWidth();
    const auto height = (float) getHeight();

    g.fillAll (juce::Colours::black);
    g.setColour (juce::Colours::grey);
    g.fillRect (0.0f, height - 1.0f, width, 1.0f);

    if (! visibleRange.has_value() || visibleRange->getLength() <= 0.0 || getWidth() <= 0)
        return;

    const auto& range = *visibleRange;

    const auto step = chooseRulerStep (range, width, [this] (const juce::String& label)
                                       { return labelGap + juce::GlyphArrangement::getStringWidth (font, label) + labelPadding; });
    const auto minorStep = step.seconds / step.minorDivisions;
    const auto majorTickHeight = height - 1.0f;
    const auto minorTickHeight = std::round (height * 0.25f);

    g.setFont (font);

    // Ticks are counted in whole minor steps, so their times don't drift with repeated additions. Starting a
    // whole step before the Visible Range lets a label slide off the left edge rather than vanish with its tick.
    const auto first = std::max ((juce::int64) 0, (juce::int64) std::ceil ((range.getStart() - step.seconds) / minorStep - 1e-9));
    const auto last = (juce::int64) std::floor (range.getEnd() / minorStep + 1e-9);

    for (auto i = first; i <= last; ++i)
    {
        const auto time = (double) i * minorStep;
        // Rounded as the Playhead is, so a tick and the Playhead at the same time share a pixel column.
        const auto x = (float) juce::roundToInt (range.fractionOf (time) * width);
        const auto isMajor = i % step.minorDivisions == 0;
        const auto tickHeight = isMajor ? majorTickHeight : minorTickHeight;

        g.setColour (isMajor ? juce::Colours::lightgrey : juce::Colours::grey);
        g.fillRect (x - 0.5f, height - 1.0f - tickHeight, 1.0f, tickHeight);

        if (isMajor)
        {
            g.setColour (juce::Colours::lightgrey);
            g.drawText (formatRulerTime (time, step.showsTenths()),
                        juce::Rectangle<float> (x + labelGap, 0.0f, width, height - minorTickHeight - 1.0f),
                        juce::Justification::centredLeft,
                        false);
        }
    }
}
} // namespace diffuscore
