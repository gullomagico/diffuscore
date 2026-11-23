#pragma once

#include <juce_gui_basics/juce_gui_basics.h>

namespace diffuscore
{
/** The content of the main window. Empty in 0.1.0's skeleton. */
class MainComponent final : public juce::Component
{
public:
    MainComponent();

    void paint (juce::Graphics& g) override;

private:
    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (MainComponent)
};
} // namespace diffuscore
