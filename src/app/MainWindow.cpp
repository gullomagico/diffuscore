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

    // The main component handles File → Open (Ctrl+O), Audio Settings, the Transport (Space) and Zoom (+, −, 0),
    // then passes other commands on to the application, which handles
    // StandardApplicationCommandIDs::quit (Ctrl+Q).
    commandManager.registerAllCommandsForTarget (mainComponent);
    commandManager.registerAllCommandsForTarget (juce::JUCEApplication::getInstance());
    commandManager.setFirstCommandTarget (mainComponent);
    addKeyListener (commandManager.getKeyMappings());

    setUsingNativeTitleBar (true);
    setApplicationCommandManagerToWatch (&commandManager);
    setMenuBar (this);
    setResizable (true, true);
    setResizeLimits (800, 500, 1 << 20, 1 << 20); // no maximum
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
    return { "File", "Transport", "View" };
}

juce::PopupMenu MainWindow::getMenuForIndex (int topLevelMenuIndex, const juce::String&)
{
    juce::PopupMenu menu;

    if (topLevelMenuIndex == 0)
    {
        menu.addCommandItem (&commandManager, MainComponent::openFile);
        menu.addSeparator();
        menu.addCommandItem (&commandManager, MainComponent::audioSettings);
        menu.addSeparator();
        menu.addCommandItem (&commandManager, juce::StandardApplicationCommandIDs::quit);
    }
    else if (topLevelMenuIndex == 1)
    {
        menu.addCommandItem (&commandManager, MainComponent::playPause);
        menu.addCommandItem (&commandManager, MainComponent::stopPlayback);
    }
    else if (topLevelMenuIndex == 2)
    {
        menu.addCommandItem (&commandManager, MainComponent::zoomIn);
        menu.addCommandItem (&commandManager, MainComponent::zoomOut);
        menu.addCommandItem (&commandManager, MainComponent::zoomOutToWholeSource);
        menu.addSeparator();
        menu.addCommandItem (&commandManager, MainComponent::toggleFollow);
    }

    return menu;
}

void MainWindow::menuItemSelected (int, int)
{
}
} // namespace diffuscore
