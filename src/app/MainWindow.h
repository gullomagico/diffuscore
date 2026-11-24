#pragma once

#include <juce_gui_basics/juce_gui_basics.h>

namespace diffuscore
{
/** The resizable main window, with the menu bar (File → Open, Quit). */
class MainWindow final : public juce::DocumentWindow,
                         private juce::MenuBarModel
{
public:
    explicit MainWindow (const juce::String& name);
    ~MainWindow() override;

    void closeButtonPressed() override;

private:
    juce::StringArray getMenuBarNames() override;
    juce::PopupMenu getMenuForIndex (int topLevelMenuIndex, const juce::String& menuName) override;
    void menuItemSelected (int menuItemID, int topLevelMenuIndex) override;

    juce::ApplicationCommandManager commandManager;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (MainWindow)
};
} // namespace diffuscore
