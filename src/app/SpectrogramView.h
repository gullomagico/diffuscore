#pragma once

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
    Ctrl + two-finger scroll) zooms and Shift + wheel moves; the handlers below still serve macOS and Windows. */
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
        It is also hidden while outside the Visible Range. */
    void setPlayhead (std::optional<double> secondsInSource);

    /** Called on a click with the time in the Source under the mouse, in seconds. */
    std::function<void (double secondsInSource)> onSeek;

    /** Called once the analysis has finished, when zoom becomes available. */
    std::function<void()> onZoomAvailable;

    bool canZoom() const noexcept { return visibleRange.has_value() && spectrogram.has_value(); }

    /** Zooms in by this factor (below 1 zooms out) around the Playhead, or around the centre of the
        Visible Range when the Playhead is outside it. Does nothing until zoom is available. */
    void zoomAroundPlayhead (double factor);

    void zoomOutToWholeSource();

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
    void changeVisibleRange (const std::function<void (VisibleRange&)>& change);
    void paintSpectrogram (juce::Graphics& g);
    void render (int width, int height);
    juce::Rectangle<int> playheadArea (std::optional<double> secondsInSource) const;

    std::unique_ptr<AnalysisThread> analysis;
    std::optional<Spectrogram> spectrogram;
    std::optional<VisibleRange> visibleRange; // the whole Source until the analysis has finished
    juce::Image image;                        // the Spectrogram rendered at the view's size in physical pixels
    std::optional<VisibleRange> imageRange;   // the Visible Range the image was rendered for
    std::optional<double> playhead;
    double progress = 0.0;
    juce::ProgressBar progressBar { progress };

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (SpectrogramView)
};
} // namespace diffuscore
