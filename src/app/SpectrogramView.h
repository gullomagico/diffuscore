#pragma once

#include <Follow.h>
#include <Spectrogram.h>
#include <VisibleRange.h>

#include <juce_gui_basics/juce_gui_basics.h>

namespace diffuscore
{
/** Shows the Spectrogram over the Visible Range, with the Playhead over it.
    The analysis runs on a background thread with a progress bar; resizing redraws from the analysed
    levels without analysing again. A click reports where in the Source it landed through onSeek.

    Zoom and scroll become available once the analysis has finished, starting from the whole Source:
    Ctrl/Cmd + wheel and pinch zoom around the mouse; horizontal scroll and Shift + wheel move the
    Visible Range. Until then, the Playhead and clicks map over the whole Source.

    On Linux, JUCE delivers neither horizontal scroll nor pinch (ADR-0005): there, Ctrl + wheel (or
    Ctrl + two-finger scroll) zooms and Shift + wheel moves; the handlers below still serve macOS and Windows.

    Follow (page turn) keeps the Playhead in view as it moves. It is on for every new Source; any scroll
    or zoom by hand (here, or through the zoom and move functions below) switches it off. */
class SpectrogramView final : public juce::Component,
                              private juce::Timer
{
public:
    SpectrogramView();
    ~SpectrogramView() override;

    /** Starts analysing the Source, or clears the view when nullptr. Stops any analysis in progress first,
        so call setSource (nullptr) before destroying the Source being analysed. */
    void setSource (const Source* source);

    /** Moves the Playhead to this time in the Source, in seconds, or hides it.
        It is also hidden while outside the Visible Range; with Follow on, the Visible Range moves to show it. */
    void setPlayhead (std::optional<double> secondsInSource);

    /** Called on a click with the time in the Source under the mouse, in seconds. */
    std::function<void (double secondsInSource)> onSeek;

    /** Called whenever the Visible Range changes: on a new Source, zoom, scroll or resize. */
    std::function<void()> onVisibleRangeChanged;

    /** The Visible Range (the whole Source until the analysis has finished), or none without a Source. */
    const std::optional<VisibleRange>& getVisibleRange() const noexcept { return visibleRange; }

    /** Called when the analysed Spectrogram appears or goes: once the analysis has finished (when zoom
        becomes available), and on a new Source. */
    std::function<void()> onSpectrogramChanged;

    /** The analysed Spectrogram, or nullptr until the analysis has finished. Valid until onSpectrogramChanged. */
    const Spectrogram* getSpectrogram() const noexcept { return spectrogram.has_value() ? &*spectrogram : nullptr; }

    bool isFollowing() const noexcept { return follow.isOn(); }

    /** Switches Follow on, bringing the Playhead into view at once, or off. */
    void setFollowing (bool shouldFollow);

    /** Called when Follow switches on or off, including when a scroll or zoom by hand switches it off. */
    std::function<void()> onFollowingChanged;

    bool canZoom() const noexcept { return visibleRange.has_value() && spectrogram.has_value(); }

    /** Zooms in by this factor (below 1 zooms out) around the Playhead, or around the centre of the
        Visible Range when the Playhead is outside it. Does nothing until zoom is available. */
    void zoomAroundPlayhead (double factor);

    void zoomOutToWholeSource();

    /** Moves the Visible Range, keeping its length, so it starts at this time (stopping at the ends of the
        Source), as scrolling by hand does. Does nothing until zoom is available. */
    void moveVisibleRangeTo (double startSeconds);

    void paint (juce::Graphics& g) override;
    void resized() override;
    void mouseDown (const juce::MouseEvent& event) override;
    void mouseWheelMove (const juce::MouseEvent& event, const juce::MouseWheelDetails& wheel) override;
    void mouseMagnify (const juce::MouseEvent& event, float scaleFactor) override;

private:
    class AnalysisThread;

    void timerCallback() override;
    void stopAnalysis();
    double timeAtX (float x) const noexcept;
    void updateWidths();
    void notifyVisibleRange();
    void changeVisibleRange (const std::function<void (VisibleRange&)>& change);
    void changeVisibleRangeByHand (const std::function<void (VisibleRange&)>& change);
    void followPlayhead();
    void paintSpectrogram (juce::Graphics& g);
    juce::Rectangle<int> playheadArea (std::optional<double> secondsInSource) const;

    std::unique_ptr<AnalysisThread> analysis;
    std::optional<Spectrogram> spectrogram;
    std::optional<VisibleRange> visibleRange; // the whole Source until the analysis has finished
    juce::Image image;                        // the Spectrogram rendered at the view's size in physical pixels
    std::optional<VisibleRange> imageRange;   // the Visible Range the image was rendered for
    std::optional<VisibleRange> notifiedRange; // the Visible Range onVisibleRangeChanged last reported
    std::optional<double> playhead;
    Follow follow { FollowStyle::pageTurn };
    double progress = 0.0;
    juce::ProgressBar progressBar { progress };

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (SpectrogramView)
};
} // namespace diffuscore
