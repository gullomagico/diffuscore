#include "MainComponent.h"

namespace diffuscore
{
MainComponent::MainComponent()
{
    setSize (1000, 600);
}

void MainComponent::paint (juce::Graphics& g)
{
    g.fillAll (getLookAndFeel().findColour (juce::ResizableWindow::backgroundColourId));
}
} // namespace diffuscore
