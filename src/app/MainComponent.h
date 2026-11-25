#pragma once

#include "OverviewView.h"
#include "SpectrogramView.h"
#include "TimeRulerView.h"

#include <SourceLoading.h>
#include <Transport.h>

#include <juce_audio_devices/juce_audio_devices.h>
#include <juce_gui_basics/juce_gui_basics.h>

namespace diffuscore
{
class SourceLoadingWindow;

/** The content of the main window: holds the Source, opens files by menu or drag-and-drop,
    shows the Source's Spectrogram under a time ruler and the Overview, following the Playhead (Follow), and its details in the bottom bar. Owns the audio device,
    switched to the Source's sample rate on load (ADR-0002), and plays the Source to it through the Transport. */
class MainComponent final : public juce::Component,
                            public juce::ApplicationCommandTarget,
                            public juce::FileDragAndDropTarget,
                            private juce::AudioIODeviceCallback,
                            private juce::ChangeListener,
                            private juce::Timer
{
public:
    enum CommandIDs
    {
        openFile = 0x2000,
        audioSettings,
        playPause,
        stopPlayback,
        zoomIn,
        zoomOut,
        zoomOutToWholeSource,
        toggleFollow
    };

    explicit MainComponent (juce::ApplicationCommandManager& commandManager);
    ~MainComponent() override;

    void paint (juce::Graphics& g) override;
    void paintOverChildren (juce::Graphics& g) override;
    void resized() override;

    // ApplicationCommandTarget
    juce::ApplicationCommandTarget* getNextCommandTarget() override;
    void getAllCommands (juce::Array<juce::CommandID>& ids) override;
    void getCommandInfo (juce::CommandID commandID, juce::ApplicationCommandInfo& result) override;
    bool perform (const InvocationInfo& info) override;

    // FileDragAndDropTarget
    bool isInterestedInFileDrag (const juce::StringArray& files) override;
    void fileDragEnter (const juce::StringArray& files, int x, int y) override;
    void fileDragExit (const juce::StringArray& files) override;
    void filesDropped (const juce::StringArray& files, int x, int y) override;

private:
    // AudioIODeviceCallback: render() on the audio thread; never allocates, locks or touches the disk.
    void audioDeviceIOCallbackWithContext (const float* const* inputChannelData,
                                           int numInputChannels,
                                           float* const* outputChannelData,
                                           int numOutputChannels,
                                           int numSamples,
                                           const juce::AudioIODeviceCallbackContext& context) override;
    void audioDeviceAboutToStart (juce::AudioIODevice* device) override;
    void audioDeviceStopped() override {}

    // ChangeListener: the audio device changed
    void changeListenerCallback (juce::ChangeBroadcaster* source) override;

    // Timer: follows the Transport with the playhead, the elapsed time and the Play/Pause button
    void timerCallback() override;
    void updateTransportDisplay();

    void initialiseAudioDevice();
    void saveAudioDeviceSettings();
    void showAudioSettings();
    void switchDeviceToSourceRate();
    void updatePlayability();
    bool isPlayable() const noexcept { return source != nullptr && ! playbackRefusal.has_value(); }
    void seekToTime (double secondsInSource);
    juce::String describeElapsedAndTotal() const;
    juce::Rectangle<int> getBottomBarArea() const;

    void chooseFileToOpen();
    void requestOpen (const juce::File& file);
    void startLoading (const juce::File& file);
    void loadingFinished (juce::File file, SourceLoadResult result);
    bool isLoading() const noexcept { return loadingWindow != nullptr; }

    juce::ApplicationCommandManager& commands;
    juce::ApplicationProperties settings;
    juce::AudioDeviceManager deviceManager;
    std::unique_ptr<Source> source;
    Transport transport;                         // plays source; the audio callback is removed whenever source changes
    std::atomic<double> sourceSampleRate { 0.0 }; // for audioDeviceAboutToStart(), whichever thread calls it
    std::optional<juce::String> playbackRefusal;  // why the loaded Source can't play on the current device
    SpectrogramView spectrogramView; // after source: destroyed first, so its analysis stops before the Source goes
    TimeRulerView timeRuler; // above the Spectrogram, spanning the same x range
    OverviewView overview;   // above the time ruler; after spectrogramView, so destroyed before the Spectrogram it shows
    std::unique_ptr<SourceLoadingWindow> loadingWindow;
    std::unique_ptr<juce::FileChooser> fileChooser;
    juce::TextButton playPauseButton { "Play" };
    juce::TextButton stopButton { "Stop" };
    juce::TextButton followButton { "Follow" }; // lit while Follow is on
    juce::String elapsedAndTotal;
    bool isDraggingFileOver = false;
    bool isConfirmingReplace = false;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (MainComponent)
};
} // namespace diffuscore
