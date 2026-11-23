#include "MainWindow.h"

#include "MainComponent.h"

namespace diffuscore
{
MainWindow::MainWindow (const juce::String& name)
    : DocumentWindow (name,
                      juce::Desktop::getInstance().getDefaultLookAndFeel().findColour (backgroundColourId),
                      allButtons)
{
    // The application handles StandardApplicationCommandIDs::quit (Ctrl+Q).
    commandManager.registerAllCommandsForTarget (juce::JUCEApplication::getInstance());
    addKeyListener (commandManager.getKeyMappings());

    setUsingNativeTitleBar (true);
    setMenuBar (this);
    setContentOwned (new MainComponent(), true);
    setResizable (true, true);
    setResizeLimits (480, 320, 10000, 10000);
    centreWithSize (getWidth(), getHeight());
    setVisible (true);
}

MainWindow::~MainWindow()
{
    setMenuBar (nullptr);
}

void MainWindow::closeButtonPressed()
{
    juce::JUCEApplication::getInstance()->systemRequestedQuit();
}

juce::StringArray MainWindow::getMenuBarNames()
{
    return { "File" };
}

juce::PopupMenu MainWindow::getMenuForIndex (int topLevelMenuIndex, const juce::String&)
{
    juce::PopupMenu menu;

    if (topLevelMenuIndex == 0)
        menu.addCommandItem (&commandManager, juce::StandardApplicationCommandIDs::quit);

    return menu;
}

void MainWindow::menuItemSelected (int, int)
{
}
} // namespace diffuscore
