#include "SourceLoadingWindow.h"

#include <AvailableMemory.h>

namespace diffuscore
{
SourceLoadingWindow::SourceLoadingWindow (juce::File fileToLoad, juce::Component* parent, FinishedCallback callback)
    : ThreadWithProgressWindow ("Opening " + fileToLoad.getFileName(), true, true, 10000, {}, parent)
    , file (std::move (fileToLoad))
    , onFinished (std::move (callback))
{
}

void SourceLoadingWindow::run()
{
    result = loadSourceFile (file, availableRamBytes(), [this] (double progressSoFar)
                             {
                                 setProgress (progressSoFar);
                                 return ! threadShouldExit();
                             });
}

void SourceLoadingWindow::threadComplete (bool userPressedCancel)
{
    if (userPressedCancel)
        result = SourceLoadResult::cancelledLoad();

    // Last statement: onFinished may delete this window.
    onFinished (std::move (result));
}
} // namespace diffuscore
