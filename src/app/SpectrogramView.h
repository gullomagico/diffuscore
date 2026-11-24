#pragma once

#include <Spectrogram.h>

#include <juce_gui_basics/juce_gui_basics.h>

namespace diffuscore
{
/** Shows the Spectrogram of the whole Source fitted to its bounds, with the playhead over it.
    The analysis runs on a background thread with a progress bar; resizing redraws from the analysed
    levels without analysing again. A click reports where in the Source it landed through onSeek. */
class SpectrogramView final : public juce::Component,
                              private juce::Timer
{
public:
    SpectrogramView();
    ~SpectrogramView() override;

    /** Starts analysing the Source, or clears the view when nullptr. Stops any analysis in progress first,
        so call setSource (nullptr) before destroying the Source being analysed. */
    void setSource (const Source* source);

    /** Moves the playhead to this fraction of the Source (0 = start, 1 = end), or hides it. */
    void setPlayhead (std::optional<double> fractionOfSource);

    /** Called on a click with the fraction of the Source under the mouse (0 = start, 1 = end). */
    std::function<void (double fractionOfSource)> onSeek;

    void paint (juce::Graphics& g) override;
    void resized() override;
    void mouseDown (const juce::MouseEvent& event) override;

private:
    class AnalysisThread;

    void timerCallback() override;
    void stopAnalysis();
    void paintSpectrogram (juce::Graphics& g);
    void render (int width, int height);
    juce::Rectangle<int> playheadArea (std::optional<double> fractionOfSource) const;

    std::unique_ptr<AnalysisThread> analysis;
    std::optional<Spectrogram> spectrogram;
    juce::Image image; // the Spectrogram rendered at the view's size in physical pixels
    std::optional<double> playhead;
    double progress = 0.0;
    juce::ProgressBar progressBar { progress };

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (SpectrogramView)
};
} // namespace diffuscore
