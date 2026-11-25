#include "SpectrogramView.h"

#include <array>
#include <atomic>
#include <cmath>

namespace diffuscore
{
namespace
{
/** A polynomial fit of matplotlib's magma (within 5/255 per component), sampled into a lookup table. */
const std::array<juce::PixelARGB, 256>& magma()
{
    static const auto table = []
    {
        std::array<juce::PixelARGB, 256> colours;

        for (size_t i = 0; i < colours.size(); ++i)
        {
            const auto t = (double) i / (double) (colours.size() - 1);
            const auto component = [t] (std::array<double, 7> c)
            {
                const auto value = c[0] + t * (c[1] + t * (c[2] + t * (c[3] + t * (c[4] + t * (c[5] + t * c[6])))));
                return (juce::uint8) juce::roundToInt (juce::jlimit (0.0, 1.0, value) * 255.0);
            };

            colours[i] = juce::PixelARGB (255,
                                          component ({ -0.002136485, 0.2516605407, 8.3537172792, -27.6687330858, 52.1761398123, -50.7685253647, 18.6557050659 }),
                                          component ({ -0.000749655, 0.6775232437, -3.5777195150, 14.2647307810, -27.9436060717, 29.0465828213, -11.4897735200 }),
                                          component ({ -0.005386128, 2.4940265993, 0.3144679030, -13.6492131881, 12.9441694424, 4.2341529938, -5.6019615087 }));
        }

        return colours;
    }();

    return table;
}

// One wheel notch is roughly 0.1 to 0.2 in JUCE's units, depending on the platform.
constexpr double zoomPerWheelUnit = 2.0;   // 2^(wheel * this): about 1.2x to 1.3x per notch
constexpr double movePerWheelUnit = 0.5;   // fraction of the Visible Range's length: about 5 to 10% per notch

juce::PixelARGB colourForLevel (float levelDb)
{
    const auto position = (levelDb - spectrogram::floorDb) / (spectrogram::ceilingDb - spectrogram::floorDb);
    return magma()[(size_t) juce::jlimit (0, 255, juce::roundToInt (position * 255.0f))];
}
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

    if (onZoomAvailable != nullptr)
        onZoomAvailable();
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

void SpectrogramView::zoomAroundPlayhead (double factor)
{
    changeVisibleRange ([&] (VisibleRange& range) { range.zoomAroundPlayhead (factor, playhead); });
}

void SpectrogramView::zoomOutToWholeSource()
{
    changeVisibleRange ([] (VisibleRange& range) { range.zoomOutToWholeSource(); });
}

void SpectrogramView::setPlayhead (std::optional<double> secondsInSource)
{
    if (secondsInSource == playhead)
        return;

    repaint (playheadArea (playhead));
    playhead = secondsInSource;
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
        changeVisibleRange ([&] (VisibleRange& range) { range.zoom (factor, anchor); });
        return;
    }

    // Scrolling right or down (negative deltas) moves later in the Source.
    const auto delta = ! juce::exactlyEqual (wheel.deltaX, 0.0f) ? wheel.deltaX : (event.mods.isShiftDown() ? wheel.deltaY : 0.0f);

    if (! juce::exactlyEqual (delta, 0.0f))
        changeVisibleRange ([&] (VisibleRange& range) { range.move (-(double) delta * movePerWheelUnit * range.getLength()); });
    else
        Component::mouseWheelMove (event, wheel);
}

void SpectrogramView::mouseMagnify (const juce::MouseEvent& event, float scaleFactor)
{
    const auto anchor = timeAtX (event.position.x);
    changeVisibleRange ([&] (VisibleRange& range) { range.zoom (scaleFactor, anchor); });
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
        render (width, height);

    g.drawImage (image, getLocalBounds().toFloat());
}

void SpectrogramView::resized()
{
    progressBar.setBounds (getLocalBounds().withSizeKeepingCentre (juce::jmin (400, getWidth() - 40), 24));
    updateWidths(); // keeps the Visible Range, re-applying the deepest limit to the new width
    notifyVisibleRange();
}

void SpectrogramView::render (int width, int height)
{
    const auto& analysed = *spectrogram;
    const auto& range = *visibleRange;
    image = juce::Image (juce::Image::ARGB, width, height, false);
    imageRange = range;
    const juce::Image::BitmapData pixels (image, juce::Image::BitmapData::writeOnly);

    const auto columnAt = [&] (int x)
    {
        // The column under the left edge of physical pixel x.
        const auto seconds = range.timeAt ((double) x / width);
        return analysed.secondsPerColumn > 0.0 ? (int) std::floor (seconds / analysed.secondsPerColumn) : 0;
    };

    // Each pixel shows the loudest level among the columns and rows it covers, so short or narrow events
    // stay visible when zoomed out. Zoomed in, neighbouring pixels share a column and repeat it: plain blocks.
    std::vector<float> columnLevels ((size_t) analysed.numRows);
    int previousFirst = -1, previousEnd = -1;

    for (int x = 0; x < width; ++x)
    {
        const auto firstColumn = juce::jlimit (0, analysed.numColumns - 1, columnAt (x));
        const auto endColumn = juce::jlimit (firstColumn + 1, analysed.numColumns, columnAt (x + 1));

        if (firstColumn == previousFirst && endColumn == previousEnd)
        {
            for (int y = 0; y < height; ++y)
                *reinterpret_cast<juce::PixelARGB*> (pixels.getPixelPointer (x, y)) = *reinterpret_cast<const juce::PixelARGB*> (pixels.getPixelPointer (x - 1, y));

            continue;
        }

        previousFirst = firstColumn;
        previousEnd = endColumn;
        std::fill (columnLevels.begin(), columnLevels.end(), spectrogram::floorDb);

        for (int column = firstColumn; column < endColumn; ++column)
            for (int row = 0; row < analysed.numRows; ++row)
                columnLevels[(size_t) row] = std::max (columnLevels[(size_t) row], analysed.getLevel (column, row));

        for (int y = 0; y < height; ++y)
        {
            const auto fromBottom = height - 1 - y;
            const auto firstRow = fromBottom * analysed.numRows / height;
            const auto endRow = std::max (firstRow + 1, (fromBottom + 1) * analysed.numRows / height);
            auto level = spectrogram::floorDb;

            for (int row = firstRow; row < endRow; ++row)
                level = std::max (level, columnLevels[(size_t) row]);

            *reinterpret_cast<juce::PixelARGB*> (pixels.getPixelPointer (x, y)) = colourForLevel (level);
        }
    }
}
} // namespace diffuscore
