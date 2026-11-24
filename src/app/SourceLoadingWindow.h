#pragma once

#include <SourceLoading.h>

#include <juce_gui_basics/juce_gui_basics.h>

namespace diffuscore
{
/** Loads a Source on a background thread, showing a progress bar with a Cancel button. */
class SourceLoadingWindow final : public juce::ThreadWithProgressWindow
{
public:
    /** Called on the message thread with the outcome. The callback may delete this window. */
    using FinishedCallback = std::function<void (SourceLoadResult)>;

    SourceLoadingWindow (juce::File fileToLoad, juce::Component* parent, FinishedCallback onFinished);

private:
    void run() override;
    void threadComplete (bool userPressedCancel) override;

    const juce::File file;
    const FinishedCallback onFinished;
    SourceLoadResult result;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (SourceLoadingWindow)
};
} // namespace diffuscore
