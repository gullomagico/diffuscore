#include "MainWindow.h"

#include "MainComponent.h"

namespace diffuscore
{
MainWindow::MainWindow (const juce::String& name)
    : DocumentWindow (name,
                      juce::Desktop::getInstance().getDefaultLookAndFeel().findColour (backgroundColourId),
                      allButtons)
{
    auto* mainComponent = new MainComponent (commandManager);
    setContentOwned (mainComponent, true);

    // The main component handles File → Open (Ctrl+O), then passes other commands on to
    // the application, which handles StandardApplicationCommandIDs::quit (Ctrl+Q).
    commandManager.registerAllCommandsForTarget (mainComponent);
    commandManager.registerAllCommandsForTarget (juce::JUCEApplication::getInstance());
    commandManager.setFirstCommandTarget (mainComponent);
    addKeyListener (commandManager.getKeyMappings());

    setUsingNativeTitleBar (true);
    setApplicationCommandManagerToWatch (&commandManager);
    setMenuBar (this);
    setResizable (true, true);
    setResizeLimits (480, 320, 10000, 10000);
    centreWithSize (getWidth(), getHeight());
    setVisible (true);
}

MainWindow::~MainWindow()
{
    setMenuBar (nullptr);
    commandManager.setFirstCommandTarget (nullptr);
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
    {
        menu.addCommandItem (&commandManager, MainComponent::openFile);
        menu.addSeparator();
        menu.addCommandItem (&commandManager, juce::StandardApplicationCommandIDs::quit);
    }

    return menu;
}

void MainWindow::menuItemSelected (int, int)
{
}
} // namespace diffuscore
