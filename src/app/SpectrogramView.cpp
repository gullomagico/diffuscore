#include "SpectrogramView.h"

#include <array>
#include <atomic>

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
    image = {};

    if (source != nullptr)
    {
        progress = 0.0;
        progressBar.setVisible (true);
        analysis = std::make_unique<AnalysisThread> (*source);
        analysis->startThread();
        startTimerHz (30);
    }

    repaint();
}

void SpectrogramView::stopAnalysis()
{
    stopTimer();
    progressBar.setVisible (false);

    if (analysis != nullptr)
    {
        // The analysis checks threadShouldExit() after every column, so it stops within milliseconds.
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
}

void SpectrogramView::paint (juce::Graphics& g)
{
    if (! spectrogram.has_value() || getWidth() <= 0 || getHeight() <= 0)
        return;

    const auto scale = g.getInternalContext().getPhysicalPixelScaleFactor();
    const auto width = juce::roundToInt ((float) getWidth() * scale);
    const auto height = juce::roundToInt ((float) getHeight() * scale);

    if (! image.isValid() || image.getWidth() != width || image.getHeight() != height)
        render (width, height);

    g.drawImage (image, getLocalBounds().toFloat());
}

void SpectrogramView::resized()
{
    progressBar.setBounds (getLocalBounds().withSizeKeepingCentre (juce::jmin (400, getWidth() - 40), 24));
}

void SpectrogramView::render (int width, int height)
{
    const auto& analysed = *spectrogram;
    image = juce::Image (juce::Image::ARGB, width, height, false);
    const juce::Image::BitmapData pixels (image, juce::Image::BitmapData::writeOnly);

    // Each pixel shows the loudest level among the columns and rows it covers, so short or narrow events stay visible.
    std::vector<float> columnLevels ((size_t) analysed.numRows);

    for (int x = 0; x < width; ++x)
    {
        const auto firstColumn = (int) ((juce::int64) x * analysed.numColumns / width);
        const auto endColumn = std::max (firstColumn + 1, (int) ((juce::int64) (x + 1) * analysed.numColumns / width));
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
