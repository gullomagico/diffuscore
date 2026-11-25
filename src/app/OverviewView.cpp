#include "OverviewView.h"

#include "SpectrogramImage.h"

namespace diffuscore
{
namespace
{
constexpr double minimumMarkWidth = 6.0; // logical pixels, so the mark stays visible and grabbable zoomed far in
} // namespace

OverviewView::OverviewView()
{
    setOpaque (true);
}

void OverviewView::setSpectrogram (const Spectrogram* analysed)
{
    spectrogram = analysed;
    image = {};
    drag.reset();
    updateMouseCursor();
    repaint();
}

void OverviewView::setVisibleRange (std::optional<VisibleRange> range)
{
    if (range == visibleRange)
        return;

    visibleRange = range;
    repaint();
}

void OverviewView::setPlayhead (std::optional<double> secondsInSource)
{
    if (playheadX (secondsInSource) != playheadX (playhead))
        repaint();

    playhead = secondsInSource;
}

std::optional<int> OverviewView::playheadX (std::optional<double> secondsInSource) const
{
    if (! isActive() || ! secondsInSource.has_value() || visibleRange->getSourceDuration() <= 0.0)
        return std::nullopt;

    return juce::roundToInt (*secondsInSource / visibleRange->getSourceDuration() * getWidth());
}

OverviewMark OverviewView::getMark() const
{
    return markVisibleRange (*visibleRange, getWidth(), minimumMarkWidth);
}

void OverviewView::requestVisibleRange (const VisibleRange& moved)
{
    // The Visible Range comes back through setVisibleRange, which repaints the mark.
    if (onMoveVisibleRange != nullptr)
        onMoveVisibleRange (moved.getStart());
}

void OverviewView::mouseMove (const juce::MouseEvent& event)
{
    const auto overMark = isActive() && getMark().contains (event.position.x);
    setMouseCursor (overMark ? juce::MouseCursor::DraggingHandCursor : juce::MouseCursor::NormalCursor);
}

void OverviewView::mouseDown (const juce::MouseEvent& event)
{
    if (! isActive())
        return;

    auto moved = *visibleRange;
    drag.emplace (moved, event.position.x, getWidth(), minimumMarkWidth);
    setMouseCursor (juce::MouseCursor::DraggingHandCursor);
    requestVisibleRange (moved);
}

void OverviewView::mouseDrag (const juce::MouseEvent& event)
{
    if (! drag.has_value() || ! isActive())
        return;

    auto moved = *visibleRange;
    drag->dragTo (moved, event.position.x);
    requestVisibleRange (moved);
}

void OverviewView::mouseUp (const juce::MouseEvent& event)
{
    drag.reset();
    mouseMove (event);
}

void OverviewView::paint (juce::Graphics& g)
{
    const auto width = (float) getWidth();
    const auto height = (float) getHeight();

    g.fillAll (juce::Colours::black);

    if (isActive() && getHeight() > 1)
    {
        const auto area = getLocalBounds().withTrimmedBottom (1);
        const auto scale = g.getInternalContext().getPhysicalPixelScaleFactor();
        const auto imageWidth = juce::roundToInt ((float) area.getWidth() * scale);
        const auto imageHeight = juce::roundToInt ((float) area.getHeight() * scale);

        if (! image.isValid() || image.getWidth() != imageWidth || image.getHeight() != imageHeight)
        {
            const VisibleRange wholeSource (visibleRange->getSourceDuration(), 0.0, 0.0);
            image = renderSpectrogramImage (*spectrogram, wholeSource, imageWidth, imageHeight);
        }

        g.drawImage (image, area.toFloat());

        // Outside the Visible Range dimmed, the Visible Range itself outlined.
        const auto mark = getMark();
        const auto markArea = juce::Rectangle<float>::leftTopRightBottom ((float) mark.left, 0.0f, (float) mark.right, (float) area.getHeight());
        g.setColour (juce::Colours::black.withAlpha (0.5f));
        g.fillRect (area.toFloat().withRight (markArea.getX()));
        g.fillRect (area.toFloat().withLeft (markArea.getRight()));
        g.setColour (juce::Colours::white);
        g.drawRect (markArea, 1.0f);

        if (const auto x = playheadX (playhead))
            g.fillRect (juce::Rectangle<float> ((float) *x - 0.5f, 0.0f, 1.0f, (float) area.getHeight()));
    }

    g.setColour (juce::Colours::grey);
    g.fillRect (0.0f, height - 1.0f, width, 1.0f);
}
} // namespace diffuscore
