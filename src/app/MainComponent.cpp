#include "MainComponent.h"

#include "SourceLoadingWindow.h"

namespace diffuscore
{
namespace
{
constexpr int bottomBarHeight = 28;

juce::String describeDuration (double seconds)
{
    const auto totalSeconds = (int) std::round (seconds);
    const auto hours = totalSeconds / 3600;
    const auto minutes = (totalSeconds / 60) % 60;
    const auto secs = totalSeconds % 60;

    const auto mmss = juce::String (minutes).paddedLeft ('0', hours > 0 ? 2 : 1) + ":" + juce::String (secs).paddedLeft ('0', 2);
    return hours > 0 ? juce::String (hours) + ":" + mmss : mmss;
}

juce::String describeSampleRate (double sampleRate)
{
    // 48000 → "48 kHz", 44100 → "44.1 kHz", 22050 → "22.05 kHz"
    auto kHz = juce::String (sampleRate / 1000.0, 3);

    if (kHz.containsChar ('.'))
        kHz = kHz.trimCharactersAtEnd ("0").trimCharactersAtEnd (".");

    return kHz + " kHz";
}

juce::String describeChannels (int numChannels)
{
    return numChannels == 1 ? "Mono" : "Stereo";
}
} // namespace

MainComponent::MainComponent (juce::ApplicationCommandManager& commandManager)
    : commands (commandManager)
{
    setSize (1000, 600);
}

MainComponent::~MainComponent() = default;

void MainComponent::paint (juce::Graphics& g)
{
    const auto& lf = getLookAndFeel();
    g.fillAll (lf.findColour (juce::ResizableWindow::backgroundColourId));

    auto area = getLocalBounds();
    const auto bottomBar = area.removeFromBottom (bottomBarHeight);
    const auto textColour = lf.findColour (juce::Label::textColourId);

    if (source == nullptr)
    {
        g.setColour (textColour.withAlpha (0.6f));
        g.setFont (18.0f);
        g.drawFittedText ("Open an audio file (Ctrl+O) or drop it here", area.reduced (20), juce::Justification::centred, 2);
    }

    g.setColour (lf.findColour (juce::ResizableWindow::backgroundColourId).brighter (0.1f));
    g.fillRect (bottomBar);

    if (source != nullptr)
    {
        const auto info = source->fileName
                        + "   |   " + describeDuration (source->getDurationSeconds())
                        + "   |   " + describeSampleRate (source->sampleRate)
                        + "   |   " + describeChannels (source->getNumChannels());

        g.setColour (textColour);
        g.setFont (14.0f);
        g.drawFittedText (info, bottomBar.reduced (10, 0), juce::Justification::centredLeft, 1);
    }

    if (isDraggingFileOver)
    {
        g.setColour (lf.findColour (juce::TextButton::buttonOnColourId));
        g.drawRect (getLocalBounds(), 3);
    }
}

juce::ApplicationCommandTarget* MainComponent::getNextCommandTarget()
{
    return juce::JUCEApplication::getInstance();
}

void MainComponent::getAllCommands (juce::Array<juce::CommandID>& ids)
{
    ids.add (openFile);
}

void MainComponent::getCommandInfo (juce::CommandID commandID, juce::ApplicationCommandInfo& result)
{
    if (commandID == openFile)
    {
        result.setInfo ("Open...", "Opens an audio file as the Source", "File", 0);
        result.addDefaultKeypress ('o', juce::ModifierKeys::commandModifier);
        result.setActive (! isLoading());
    }
}

bool MainComponent::perform (const InvocationInfo& info)
{
    if (info.commandID != openFile)
        return false;

    chooseFileToOpen();
    return true;
}

bool MainComponent::isInterestedInFileDrag (const juce::StringArray& files)
{
    return files.size() == 1 && ! isLoading();
}

void MainComponent::fileDragEnter (const juce::StringArray&, int, int)
{
    isDraggingFileOver = true;
    repaint();
}

void MainComponent::fileDragExit (const juce::StringArray&)
{
    isDraggingFileOver = false;
    repaint();
}

void MainComponent::filesDropped (const juce::StringArray& files, int, int)
{
    isDraggingFileOver = false;
    repaint();
    requestOpen (juce::File (files[0]));
}

void MainComponent::chooseFileToOpen()
{
    if (isLoading())
        return;

    fileChooser = std::make_unique<juce::FileChooser> ("Open an audio file", juce::File(), supportedFileWildcard());
    fileChooser->launchAsync (juce::FileBrowserComponent::openMode | juce::FileBrowserComponent::canSelectFiles,
                              [safeThis = SafePointer (this)] (const juce::FileChooser& chooser)
                              {
                                  if (safeThis != nullptr && chooser.getResult() != juce::File())
                                      safeThis->requestOpen (chooser.getResult());
                              });
}

void MainComponent::requestOpen (const juce::File& file)
{
    if (isLoading() || isConfirmingReplace)
        return;

    if (source == nullptr)
    {
        startLoading (file);
        return;
    }

    const auto options = juce::MessageBoxOptions()
                             .withIconType (juce::MessageBoxIconType::QuestionIcon)
                             .withTitle ("Replace the Source?")
                             .withMessage ("\"" + source->fileName + "\" is open. Open \"" + file.getFileName() + "\" instead?")
                             .withButton (juce::MessageBoxButtonOptions ("Open", 1).withPreferredAction())
                             .withButton (juce::MessageBoxButtonOptions ("Cancel", 0).withRole (juce::MessageBoxButtonRole::cancel))
                             .withAssociatedComponent (this);

    isConfirmingReplace = true;
    juce::AlertWindow::showAsync (options, [safeThis = SafePointer (this), file] (int result)
                                  {
                                      if (safeThis == nullptr)
                                          return;

                                      safeThis->isConfirmingReplace = false;

                                      if (result == 1)
                                          safeThis->startLoading (file);
                                  });
}

void MainComponent::startLoading (const juce::File& file)
{
    if (isLoading())
        return;

    loadingWindow = std::make_unique<SourceLoadingWindow> (file, this, [this, file] (SourceLoadResult result)
                                                           {
                                                               loadingFinished (file, std::move (result));
                                                           });
    commands.commandStatusChanged();
    loadingWindow->launchThread();
}

void MainComponent::loadingFinished (juce::File file, SourceLoadResult result)
{
    // Deletes the window, and the callback that called us: only use the parameters from here on.
    loadingWindow = nullptr;
    commands.commandStatusChanged();

    if (result.source != nullptr)
    {
        source = std::move (result.source);
        repaint();
    }
    else if (! result.cancelled)
    {
        juce::AlertWindow::showAsync (juce::MessageBoxOptions()
                                          .withIconType (juce::MessageBoxIconType::WarningIcon)
                                          .withTitle ("Can't open \"" + file.getFileName() + "\"")
                                          .withMessage (result.refusal)
                                          .withButton ("OK", 0)
                                          .withAssociatedComponent (this),
                                      nullptr);
    }
}
} // namespace diffuscore
