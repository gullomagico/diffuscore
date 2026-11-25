#pragma once

#include <Overview.h>
#include <Spectrogram.h>

#include <juce_gui_basics/juce_gui_basics.h>

namespace diffuscore
{
/** The Overview: the Spectrogram of the whole Source fitted to the width, with the Visible Range marked on it
    and the Playhead as a thin line. Empty until the analysis has finished.

    Dragging the mark moves the Visible Range; pressing elsewhere centres the Visible Range there (and dragging
    carries on from there). Both are reported through onMoveVisibleRange, as scrolling by hand. The Overview
    never moves the Transport. */
class OverviewView final : public juce::Component
{
public:
    static constexpr int preferredHeight = 40;

    OverviewView();

    /** The analysed Spectrogram to show, or nullptr to show nothing. Must stay valid until replaced. */
    void setSpectrogram (const Spectrogram* analysed);

    /** The Visible Range to mark, or none without a Source. */
    void setVisibleRange (std::optional<VisibleRange> range);

    /** Moves the Playhead to this time in the Source, in seconds, or hides it. */
    void setPlayhead (std::optional<double> secondsInSource);

    /** Called while pressing or dragging with the start the Visible Range should move to, in seconds. */
    std::function<void (double startSeconds)> onMoveVisibleRange;

    void paint (juce::Graphics& g) override;
    void mouseMove (const juce::MouseEvent& event) override;
    void mouseDown (const juce::MouseEvent& event) override;
    void mouseDrag (const juce::MouseEvent& event) override;
    void mouseUp (const juce::MouseEvent& event) override;

private:
    bool isActive() const noexcept { return spectrogram != nullptr && visibleRange.has_value() && getWidth() > 0; }
    OverviewMark getMark() const;
    std::optional<int> playheadX (std::optional<double> secondsInSource) const;
    void requestVisibleRange (const VisibleRange& moved);

    const Spectrogram* spectrogram = nullptr;
    std::optional<VisibleRange> visibleRange;
    std::optional<double> playhead;
    std::optional<OverviewDrag> drag; // while the mouse is down
    juce::Image image;                // the whole Source, rendered at the view's size in physical pixels

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (OverviewView)
};
} // namespace diffuscore
