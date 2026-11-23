#include "MainWindow.h"

#include <juce_gui_basics/juce_gui_basics.h>

namespace diffuscore
{
class DiffuScoreApplication final : public juce::JUCEApplication
{
public:
    const juce::String getApplicationName() override { return JUCE_APPLICATION_NAME_STRING; }
    const juce::String getApplicationVersion() override { return JUCE_APPLICATION_VERSION_STRING; }
    bool moreThanOneInstanceAllowed() override { return true; }

    void initialise (const juce::String&) override
    {
        juce::LookAndFeel::setDefaultLookAndFeel (&lookAndFeel);
        mainWindow = std::make_unique<MainWindow> (getApplicationName());
    }

    void shutdown() override
    {
        mainWindow = nullptr;
        juce::LookAndFeel::setDefaultLookAndFeel (nullptr);
    }

    void systemRequestedQuit() override
    {
        quit();
    }

    void anotherInstanceStarted (const juce::String&) override {}

private:
    juce::LookAndFeel_V4 lookAndFeel { juce::LookAndFeel_V4::getDarkColourScheme() };
    std::unique_ptr<MainWindow> mainWindow;
};
} // namespace diffuscore

START_JUCE_APPLICATION (diffuscore::DiffuScoreApplication)
