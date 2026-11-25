#include "MainComponent.h"

#include "SourceLoadingWindow.h"

#include <juce_audio_utils/juce_audio_utils.h>

#include <algorithm>

namespace diffuscore
{
namespace
{
constexpr int bottomBarHeight = 28;
constexpr int transportButtonWidth = 64;
constexpr int elapsedTimeWidth = 120;
constexpr double zoomPerKeyPress = 2.0;

/** Whole seconds, truncated, so the elapsed time reaches the total exactly at the end. */
juce::String describeDuration (double seconds)
{
    const auto totalSeconds = (int) std::floor (std::max (0.0, seconds));
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

bool isSameSampleRate (double a, double b)
{
    return juce::roundToInt (a) == juce::roundToInt (b);
}

juce::PropertiesFile::Options settingsFileOptions()
{
    juce::PropertiesFile::Options options;
    options.applicationName = "DiffuScore";
    options.filenameSuffix = ".settings";
    options.folderName = "DiffuScore";
    options.osxLibrarySubFolder = "Application Support";
    return options;
}

const juce::String audioDeviceStateKey = "audioDeviceState";

void logAudioDeviceError (const juce::String& error)
{
    if (error.isNotEmpty())
        DBG ("Audio device: " << error);
}
} // namespace

MainComponent::MainComponent (juce::ApplicationCommandManager& commandManager)
    : commands (commandManager)
{
    addAndMakeVisible (overview);
    addAndMakeVisible (timeRuler);
    addAndMakeVisible (spectrogramView);
    spectrogramView.onVisibleRangeChanged = [this]
    {
        timeRuler.setVisibleRange (spectrogramView.getVisibleRange());
        overview.setVisibleRange (spectrogramView.getVisibleRange());
    };
    spectrogramView.onSeek = [this] (double seconds) { seekToTime (seconds); };
    spectrogramView.onSpectrogramChanged = [this]
    {
        overview.setSpectrogram (spectrogramView.getSpectrogram());
        commands.commandStatusChanged(); // zoom becomes available, or not
    };
    spectrogramView.onFollowingChanged = [this] { commands.commandStatusChanged(); }; // updates the Follow button and menu tick
    overview.onMoveVisibleRange = [this] (double startSeconds) { spectrogramView.moveVisibleRangeTo (startSeconds); };

    for (auto* button : { &playPauseButton, &stopButton, &followButton })
    {
        button->setWantsKeyboardFocus (false); // Space is the Play/Pause key, not a button click
        addAndMakeVisible (button);
    }

    playPauseButton.setCommandToTrigger (&commands, playPause, true);
    stopButton.setCommandToTrigger (&commands, stopPlayback, true);
    followButton.setCommandToTrigger (&commands, toggleFollow, true);

    settings.setStorageParameters (settingsFileOptions());
    initialiseAudioDevice();

    setSize (1000, 600);
}

MainComponent::~MainComponent()
{
    stopTimer();
    deviceManager.removeChangeListener (this);
    deviceManager.removeAudioCallback (this);
    deviceManager.closeAudioDevice();
}

void MainComponent::initialiseAudioDevice()
{
    const auto savedState = settings.getUserSettings()->getXmlValue (audioDeviceStateKey);
    logAudioDeviceError (deviceManager.initialise (0, 2, savedState.get(), true));

    deviceManager.addChangeListener (this);
    deviceManager.addAudioCallback (this);
}

void MainComponent::saveAudioDeviceSettings()
{
    // Only settings the performer chose: nothing is saved while the default device is in use.
    if (const auto state = deviceManager.createStateXml())
    {
        settings.getUserSettings()->setValue (audioDeviceStateKey, state.get());
        settings.saveIfNeeded();
    }
}

void MainComponent::showAudioSettings()
{
    // Two outputs, as a stereo pair: the Source goes to the pair chosen here, outputs 1 + 2 by default.
    auto selector = std::make_unique<juce::AudioDeviceSelectorComponent> (deviceManager, 0, 0, 2, 2, false, false, true, false);
    selector->setSize (500, 400);

    juce::DialogWindow::LaunchOptions options;
    options.content.setOwned (selector.release());
    options.dialogTitle = "Audio Settings";
    options.dialogBackgroundColour = getLookAndFeel().findColour (juce::ResizableWindow::backgroundColourId);
    options.componentToCentreAround = this;
    options.escapeKeyTriggersCloseButton = true;
    options.useNativeTitleBar = true;
    options.resizable = true;
    options.launchAsync();
}

void MainComponent::audioDeviceIOCallbackWithContext (const float* const*,
                                                      int,
                                                      float* const* outputChannelData,
                                                      int numOutputChannels,
                                                      int numSamples,
                                                      const juce::AudioIODeviceCallbackContext&)
{
    transport.render (outputChannelData, numOutputChannels, numSamples);
}

void MainComponent::audioDeviceAboutToStart (juce::AudioIODevice* device)
{
    // Before any callback at a new rate: never play the Source at the wrong pitch, even for one block.
    // The message thread then disables playback in changeListenerCallback().
    if (! isSameSampleRate (device->getCurrentSampleRate(), sourceSampleRate.load()))
        transport.pause();
}

void MainComponent::changeListenerCallback (juce::ChangeBroadcaster*)
{
    saveAudioDeviceSettings();
    updatePlayability();
}

void MainComponent::switchDeviceToSourceRate()
{
    auto* device = deviceManager.getCurrentAudioDevice();

    if (device == nullptr || isSameSampleRate (device->getCurrentSampleRate(), source->sampleRate))
        return;

    // JACK, for one, offers only the server's rate: nothing to try then.
    const auto rates = device->getAvailableSampleRates();

    if (std::none_of (rates.begin(), rates.end(), [this] (double rate) { return isSameSampleRate (rate, source->sampleRate); }))
        return;

    auto setup = deviceManager.getAudioDeviceSetup();
    setup.sampleRate = source->sampleRate;
    logAudioDeviceError (deviceManager.setAudioDeviceSetup (setup, true));
}

void MainComponent::updatePlayability()
{
    const auto wasPlayable = isPlayable();
    playbackRefusal.reset();

    if (source != nullptr)
    {
        auto* device = deviceManager.getCurrentAudioDevice();

        if (device == nullptr)
            playbackRefusal = "No audio device is open. Choose one in File > Audio Settings.";
        else if (! isSameSampleRate (device->getCurrentSampleRate(), source->sampleRate))
            playbackRefusal = "The audio device runs at " + describeSampleRate (device->getCurrentSampleRate())
                            + " and can't switch to " + describeSampleRate (source->sampleRate)
                            + ". Convert the file or change the interface rate.";
    }

    if (! isPlayable())
        transport.pause();

    if (wasPlayable != isPlayable())
        commands.commandStatusChanged();

    updateTransportDisplay();
    repaint (getBottomBarArea());
}

void MainComponent::seekToTime (double secondsInSource)
{
    if (isPlayable())
        transport.seek ((juce::int64) std::llround (secondsInSource * source->sampleRate));
}

juce::String MainComponent::describeElapsedAndTotal() const
{
    if (source == nullptr)
        return {};

    return describeDuration ((double) transport.getPosition() / source->sampleRate)
         + " / " + describeDuration (source->getDurationSeconds());
}

void MainComponent::timerCallback()
{
    updateTransportDisplay();
}

void MainComponent::updateTransportDisplay()
{
    if (source == nullptr || source->getLengthInFrames() == 0)
    {
        spectrogramView.setPlayhead (std::nullopt);
        overview.setPlayhead (std::nullopt);
        return;
    }

    const auto playhead = (double) transport.getPosition() / source->sampleRate;
    spectrogramView.setPlayhead (playhead);
    overview.setPlayhead (playhead);
    playPauseButton.setButtonText (transport.isPlaying() ? "Pause" : "Play");

    if (auto text = describeElapsedAndTotal(); text != elapsedAndTotal)
    {
        elapsedAndTotal = std::move (text);
        repaint (getBottomBarArea());
    }
}

juce::Rectangle<int> MainComponent::getBottomBarArea() const
{
    return getLocalBounds().removeFromBottom (bottomBarHeight);
}

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
        auto textArea = bottomBar.withLeft (followButton.getRight() + 4); // right of the transport buttons
        const auto timeArea = textArea.removeFromLeft (elapsedTimeWidth);

        auto info = source->fileName
                  + "   |   " + describeSampleRate (source->sampleRate)
                  + "   |   " + describeChannels (source->getNumChannels());

        if (playbackRefusal.has_value())
            info += "   |   Playback unavailable: " + *playbackRefusal;

        g.setColour (textColour);
        g.setFont (juce::FontOptions (14.0f).withStyle ("Bold"));
        g.drawFittedText (elapsedAndTotal, timeArea.reduced (8, 0), juce::Justification::centred, 1);
        g.setFont (14.0f);
        g.drawFittedText (info, textArea.reduced (10, 0), juce::Justification::centredLeft, 1);
    }
}

void MainComponent::paintOverChildren (juce::Graphics& g)
{
    // Over the Spectrogram, which would otherwise hide it.
    if (isDraggingFileOver)
    {
        g.setColour (getLookAndFeel().findColour (juce::TextButton::buttonOnColourId));
        g.drawRect (getLocalBounds(), 3);
    }
}

void MainComponent::resized()
{
    auto area = getLocalBounds();
    auto bottomBar = area.removeFromBottom (bottomBarHeight).reduced (4, 2);
    overview.setBounds (area.removeFromTop (OverviewView::preferredHeight));
    timeRuler.setBounds (area.removeFromTop (TimeRulerView::preferredHeight));
    spectrogramView.setBounds (area);

    playPauseButton.setBounds (bottomBar.removeFromLeft (transportButtonWidth));
    stopButton.setBounds (bottomBar.removeFromLeft (transportButtonWidth).withTrimmedLeft (4));
    followButton.setBounds (bottomBar.removeFromLeft (transportButtonWidth).withTrimmedLeft (4));
}

juce::ApplicationCommandTarget* MainComponent::getNextCommandTarget()
{
    return juce::JUCEApplication::getInstance();
}

void MainComponent::getAllCommands (juce::Array<juce::CommandID>& ids)
{
    ids.addArray ({ openFile, audioSettings, playPause, stopPlayback, zoomIn, zoomOut, zoomOutToWholeSource, toggleFollow });
}

void MainComponent::getCommandInfo (juce::CommandID commandID, juce::ApplicationCommandInfo& result)
{
    if (commandID == openFile)
    {
        result.setInfo ("Open...", "Opens an audio file as the Source", "File", 0);
        result.addDefaultKeypress ('o', juce::ModifierKeys::commandModifier);
        result.setActive (! isLoading());
    }
    else if (commandID == audioSettings)
    {
        result.setInfo ("Audio Settings...", "Chooses the audio device and its outputs", "File", 0);
    }
    else if (commandID == playPause)
    {
        result.setInfo ("Play/Pause", "Plays or pauses the Source", "Transport", 0);
        result.addDefaultKeypress (juce::KeyPress::spaceKey, juce::ModifierKeys::noModifiers);
        result.setActive (isPlayable());
    }
    else if (commandID == stopPlayback)
    {
        result.setInfo ("Stop", "Stops and returns to the start of the Source", "Transport", 0);
        result.setActive (isPlayable());
    }
    else if (commandID == zoomIn)
    {
        result.setInfo ("Zoom In", "Zooms in around the Playhead, or the centre when the Playhead is off screen", "View", 0);
        result.addDefaultKeypress ('+', juce::ModifierKeys::noModifiers);
        result.addDefaultKeypress ('+', juce::ModifierKeys::shiftModifier); // Shift + '=' on US layouts
        result.addDefaultKeypress ('=', juce::ModifierKeys::noModifiers);
        result.addDefaultKeypress (juce::KeyPress::numberPadAdd, juce::ModifierKeys::noModifiers);
        result.setActive (spectrogramView.canZoom());
    }
    else if (commandID == zoomOut)
    {
        result.setInfo ("Zoom Out", "Zooms out around the Playhead, or the centre when the Playhead is off screen", "View", 0);
        result.addDefaultKeypress ('-', juce::ModifierKeys::noModifiers);
        result.addDefaultKeypress (juce::KeyPress::numberPadSubtract, juce::ModifierKeys::noModifiers);
        result.setActive (spectrogramView.canZoom());
    }
    else if (commandID == zoomOutToWholeSource)
    {
        result.setInfo ("Zoom Out to Whole Source", "Shows the whole Source", "View", 0);
        result.addDefaultKeypress ('0', juce::ModifierKeys::noModifiers);
        result.addDefaultKeypress (juce::KeyPress::numberPad0, juce::ModifierKeys::noModifiers);
        result.setActive (spectrogramView.canZoom());
    }
    else if (commandID == toggleFollow)
    {
        result.setInfo ("Follow", "Keeps the Playhead in view while the Transport plays", "View", 0);
        result.addDefaultKeypress ('f', juce::ModifierKeys::noModifiers);
        result.setTicked (spectrogramView.isFollowing());
        result.setActive (source != nullptr);
    }
}

bool MainComponent::perform (const InvocationInfo& info)
{
    switch (info.commandID)
    {
        case openFile:
            chooseFileToOpen();
            return true;
        case audioSettings:
            showAudioSettings();
            return true;
        case playPause:
            if (isPlayable())
                transport.togglePlayPause();
            updateTransportDisplay();
            return true;
        case stopPlayback:
            transport.stop();
            updateTransportDisplay();
            return true;
        case zoomIn:
            spectrogramView.zoomAroundPlayhead (zoomPerKeyPress);
            return true;
        case zoomOut:
            spectrogramView.zoomAroundPlayhead (1.0 / zoomPerKeyPress);
            return true;
        case zoomOutToWholeSource:
            spectrogramView.zoomOutToWholeSource();
            return true;
        case toggleFollow:
            spectrogramView.setFollowing (! spectrogramView.isFollowing());
            return true;
        default:
            return false;
    }
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
        // Neither the audio callback nor the analysis may touch the old Source once it is destroyed.
        deviceManager.removeAudioCallback (this);
        spectrogramView.setSource (nullptr);
        source = std::move (result.source);
        transport.setSource (source.get());
        sourceSampleRate = source->sampleRate;
        spectrogramView.setSource (source.get());

        switchDeviceToSourceRate();
        deviceManager.addAudioCallback (this); // after the switch, so audioDeviceAboutToStart() sees the new rate
        updatePlayability();
        commands.commandStatusChanged();
        startTimerHz (30);
        repaint();

        if (playbackRefusal.has_value())
            juce::AlertWindow::showAsync (juce::MessageBoxOptions()
                                              .withIconType (juce::MessageBoxIconType::WarningIcon)
                                              .withTitle ("Can't play \"" + source->fileName + "\"")
                                              .withMessage (*playbackRefusal)
                                              .withButton ("OK", 0)
                                              .withAssociatedComponent (this),
                                          nullptr);
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
