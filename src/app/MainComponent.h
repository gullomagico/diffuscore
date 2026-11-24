#pragma once

#include <SourceLoading.h>

#include <juce_gui_basics/juce_gui_basics.h>

namespace diffuscore
{
class SourceLoadingWindow;

/** The content of the main window: holds the Source, opens files by menu or drag-and-drop,
    and shows the Source's details in the bottom bar. */
class MainComponent final : public juce::Component,
                            public juce::ApplicationCommandTarget,
                            public juce::FileDragAndDropTarget
{
public:
    enum CommandIDs
    {
        openFile = 0x2000
    };

    explicit MainComponent (juce::ApplicationCommandManager& commandManager);
    ~MainComponent() override;

    void paint (juce::Graphics& g) override;

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
    void chooseFileToOpen();
    void requestOpen (const juce::File& file);
    void startLoading (const juce::File& file);
    void loadingFinished (juce::File file, SourceLoadResult result);
    bool isLoading() const noexcept { return loadingWindow != nullptr; }

    juce::ApplicationCommandManager& commands;
    std::unique_ptr<Source> source;
    std::unique_ptr<SourceLoadingWindow> loadingWindow;
    std::unique_ptr<juce::FileChooser> fileChooser;
    bool isDraggingFileOver = false;
    bool isConfirmingReplace = false;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (MainComponent)
};
} // namespace diffuscore
