#pragma once

#include <VisibleRange.h>

#include <juce_gui_basics/juce_gui_basics.h>

namespace diffuscore
{
/** The time ruler along the top of the Spectrogram: labelled ticks in m:ss (m:ss.d when they are less than a
    second apart) with minor ticks between, over the Visible Range. Must span the same x range as the
    SpectrogramView, so each tick lines up with the Playhead at that time. */
class TimeRulerView final : public juce::Component
{
public:
    static constexpr int preferredHeight = 22;

    TimeRulerView();

    /** The Visible Range to label, or none to show an empty ruler. */
    void setVisibleRange (std::optional<VisibleRange> range);

    void paint (juce::Graphics& g) override;

private:
    std::optional<VisibleRange> visibleRange;
    juce::Font font { juce::FontOptions (12.0f) };

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (TimeRulerView)
};
} // namespace diffuscore
