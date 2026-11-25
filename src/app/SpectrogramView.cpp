#include "SpectrogramView.h"

#include "SpectrogramImage.h"

#include <atomic>
#include <cmath>

namespace diffuscore
{
namespace
{
// One wheel notch is roughly 0.1 to 0.2 in JUCE's units, depending on the platform.
constexpr double zoomPerWheelUnit = 2.0;   // 2^(wheel * this): about 1.2x to 1.3x per notch
constexpr double movePerWheelUnit = 0.5;   // fraction of the Visible Range's length: about 5 to 10% per notch
} // namespace

class SpectrogramView::AnalysisThread final : public juce::Thread
{
public:
    explicit AnalysisThread (const Source& sourceToAnalyse)
        : Thread ("Spectrogram analysis")
        , source (sourceToAnalyse)
    {
    }

    void run() override
    {
        result = analyseSpectrogram (source, [this] (double progressSoFar)
                                     {
                                         progress = progressSoFar;
                                         return ! threadShouldExit();
                                     });
        finished = true;
    }

    const Source& source;
    std::optional<Spectrogram> result; // read only once finished is true
    std::atomic<double> progress { 0.0 };
    std::atomic<bool> finished { false };
};

SpectrogramView::SpectrogramView()
{
    progressBar.setTextToDisplay ("Analysing the Spectrogram...");
    addChildComponent (progressBar);
}

SpectrogramView::~SpectrogramView()
{
    stopAnalysis();
}

void SpectrogramView::setSource (const Source* source)
{
    stopAnalysis();
    spectrogram.reset();
    visibleRange.reset();
    image = {};
    setFollowing (true); // on for every Source, before the new Visible Range exists, so nothing moves

    if (source != nullptr)
    {
        // Every Source opens zoomed out to the whole Source.
        visibleRange.emplace (source->getDurationSeconds(), 0.0, 0.0);
        updateWidths();
        progress = 0.0;
        progressBar.setVisible (true);
        analysis = std::make_unique<AnalysisThread> (*source);
        analysis->startThread();
        startTimerHz (30);
    }

    repaint();
    notifyVisibleRange();

    if (onSpectrogramChanged != nullptr)
        onSpectrogramChanged();
}

void SpectrogramView::stopAnalysis()
{
    stopTimer();
    progressBar.setVisible (false);

    if (analysis != nullptr)
    {
        // The analysis checks threadShouldExit() after every frame, so it stops within milliseconds.
        analysis->stopThread (-1);
        analysis.reset();
    }
}

void SpectrogramView::timerCallback()
{
    progress = analysis->progress;

    if (! analysis->finished)
        return;

    auto result = std::move (analysis->result);
    stopAnalysis();
    spectrogram = std::move (result);
    repaint();

    if (onSpectrogramChanged != nullptr)
        onSpectrogramChanged();
}

double SpectrogramView::timeAtX (float x) const noexcept
{
    const auto fraction = getWidth() > 0 ? juce::jlimit (0.0, 1.0, (double) x / getWidth()) : 0.0;
    return visibleRange.has_value() ? visibleRange->timeAt (fraction) : 0.0;
}

void SpectrogramView::updateWidths()
{
    if (! visibleRange.has_value())
        return;

    // The display the view is (mostly) on, in the same logical pixels as the view's width.
    const auto* display = juce::Desktop::getInstance().getDisplays().getDisplayForRect (getScreenBounds());
    const auto displayWidth = display != nullptr ? display->logicalBounds.getWidth() : 0;

    if (getWidth() > 0 && displayWidth > 0)
        visibleRange->setWidths (getWidth(), displayWidth);
}

void SpectrogramView::notifyVisibleRange()
{
    if (notifiedRange == visibleRange)
        return;

    notifiedRange = visibleRange;

    if (onVisibleRangeChanged != nullptr)
        onVisibleRangeChanged();
}

void SpectrogramView::changeVisibleRange (const std::function<void (VisibleRange&)>& change)
{
    if (! canZoom())
        return; // zoom and scroll are unavailable until the analysis has finished

    updateWidths(); // the window may have moved to another display since the last resize
    change (*visibleRange);

    if (imageRange != visibleRange)
        repaint();

    notifyVisibleRange();
}

void SpectrogramView::changeVisibleRangeByHand (const std::function<void (VisibleRange&)>& change)
{
    if (! canZoom())
        return;

    setFollowing (false);
    changeVisibleRange (change);
}

void SpectrogramView::setFollowing (bool shouldFollow)
{
    if (shouldFollow == follow.isOn())
        return;

    if (shouldFollow)
    {
        if (canZoom() && playhead.has_value())
            changeVisibleRange ([this] (VisibleRange& range) { follow.switchOn (range, *playhead); });
        else
            follow.switchOn(); // nothing to bring into view yet
    }
    else
    {
        follow.switchOff();
    }

    if (onFollowingChanged != nullptr)
        onFollowingChanged();
}

void SpectrogramView::followPlayhead()
{
    if (playhead.has_value())
        changeVisibleRange ([this] (VisibleRange& range) { follow.followPlayhead (range, *playhead); });
}

void SpectrogramView::zoomAroundPlayhead (double factor)
{
    changeVisibleRangeByHand ([&] (VisibleRange& range) { range.zoomAroundPlayhead (factor, playhead); });
}

void SpectrogramView::moveVisibleRangeTo (double startSeconds)
{
    changeVisibleRangeByHand ([&] (VisibleRange& range) { range.moveStartTo (startSeconds); });
}

void SpectrogramView::zoomOutToWholeSource()
{
    changeVisibleRangeByHand ([] (VisibleRange& range) { range.zoomOutToWholeSource(); });
}

void SpectrogramView::setPlayhead (std::optional<double> secondsInSource)
{
    if (secondsInSource == playhead)
        return;

    repaint (playheadArea (playhead));
    playhead = secondsInSource;
    followPlayhead();
    repaint (playheadArea (playhead));
}

juce::Rectangle<int> SpectrogramView::playheadArea (std::optional<double> secondsInSource) const
{
    if (! secondsInSource.has_value() || ! visibleRange.has_value() || ! visibleRange->contains (*secondsInSource))
        return {}; // hidden while outside the Visible Range

    const auto x = juce::roundToInt (visibleRange->fractionOf (*secondsInSource) * getWidth());
    return { x - 2, 0, 4, getHeight() };
}

void SpectrogramView::mouseDown (const juce::MouseEvent& event)
{
    if (onSeek != nullptr && getWidth() > 0)
        onSeek (timeAtX (event.position.x));
}

void SpectrogramView::mouseWheelMove (const juce::MouseEvent& event, const juce::MouseWheelDetails& wheel)
{
    if (! canZoom())
        return;

    if (event.mods.isCommandDown())
    {
        const auto factor = std::pow (2.0, (double) wheel.deltaY * zoomPerWheelUnit);
        const auto anchor = timeAtX (event.position.x);
        changeVisibleRangeByHand ([&] (VisibleRange& range) { range.zoom (factor, anchor); });
        return;
    }

    // Scrolling right or down (negative deltas) moves later in the Source.
    const auto delta = ! juce::exactlyEqual (wheel.deltaX, 0.0f) ? wheel.deltaX : (event.mods.isShiftDown() ? wheel.deltaY : 0.0f);

    if (! juce::exactlyEqual (delta, 0.0f))
        changeVisibleRangeByHand ([&] (VisibleRange& range) { range.move (-(double) delta * movePerWheelUnit * range.getLength()); });
    else
        Component::mouseWheelMove (event, wheel);
}

void SpectrogramView::mouseMagnify (const juce::MouseEvent& event, float scaleFactor)
{
    const auto anchor = timeAtX (event.position.x);
    changeVisibleRangeByHand ([&] (VisibleRange& range) { range.zoom (scaleFactor, anchor); });
}

void SpectrogramView::paint (juce::Graphics& g)
{
    if (spectrogram.has_value() && getWidth() > 0 && getHeight() > 0)
        paintSpectrogram (g);

    if (const auto area = playheadArea (playhead); ! area.isEmpty())
    {
        g.setColour (juce::Colours::white);
        g.fillRect (juce::Rectangle<float> ((float) area.getCentreX() - 0.75f, 0.0f, 1.5f, (float) getHeight()));
    }
}

void SpectrogramView::paintSpectrogram (juce::Graphics& g)
{
    const auto scale = g.getInternalContext().getPhysicalPixelScaleFactor();
    const auto width = juce::roundToInt ((float) getWidth() * scale);
    const auto height = juce::roundToInt ((float) getHeight() * scale);

    if (! image.isValid() || image.getWidth() != width || image.getHeight() != height || imageRange != visibleRange)
    {
        image = renderSpectrogramImage (*spectrogram, *visibleRange, width, height);
        imageRange = visibleRange;
    }

    g.drawImage (image, getLocalBounds().toFloat());
}

void SpectrogramView::resized()
{
    progressBar.setBounds (getLocalBounds().withSizeKeepingCentre (juce::jmin (400, getWidth() - 40), 24));
    updateWidths(); // keeps the Visible Range, re-applying the deepest limit to the new width
    notifyVisibleRange();
}
} // namespace diffuscore
