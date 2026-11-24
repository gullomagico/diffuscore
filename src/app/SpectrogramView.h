#pragma once

#include <Spectrogram.h>

#include <juce_gui_basics/juce_gui_basics.h>

namespace diffuscore
{
/** Shows the Spectrogram of the whole Source fitted to its bounds. The analysis runs on a background
    thread with a progress bar; resizing redraws from the analysed levels without analysing again. */
class SpectrogramView final : public juce::Component,
                              private juce::Timer
{
public:
    SpectrogramView();
    ~SpectrogramView() override;

    /** Starts analysing the Source, or clears the view when nullptr. Stops any analysis in progress first,
        so call setSource (nullptr) before destroying the Source being analysed. */
    void setSource (const Source* source);

    void paint (juce::Graphics& g) override;
    void resized() override;

private:
    class AnalysisThread;

    void timerCallback() override;
    void stopAnalysis();
    void render (int width, int height);

    std::unique_ptr<AnalysisThread> analysis;
    std::optional<Spectrogram> spectrogram;
    juce::Image image; // the Spectrogram rendered at the view's size in physical pixels
    double progress = 0.0;
    juce::ProgressBar progressBar { progress };

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (SpectrogramView)
};
} // namespace diffuscore
