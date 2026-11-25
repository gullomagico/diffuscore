#include "SpectrogramImage.h"

#include <algorithm>
#include <array>
#include <cmath>
#include <vector>

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

juce::Image renderSpectrogramImage (const Spectrogram& analysed, const VisibleRange& range, int width, int height)
{
    juce::Image image (juce::Image::ARGB, width, height, false);
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

    return image;
}
} // namespace diffuscore
