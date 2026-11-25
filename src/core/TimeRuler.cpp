#include "TimeRuler.h"

#include <algorithm>
#include <array>
#include <cmath>

namespace diffuscore
{
namespace
{
// Minor ticks fall on round times: 0.1 s → every 0.02 s, 30 s → every 10 s, 1 min → every 15 s, and so on.
constexpr std::array<RulerStep, 16> rulerSteps { {
    { 0.1, 5 },
    { 0.2, 4 },
    { 0.5, 5 },
    { 1.0, 5 },
    { 2.0, 4 },
    { 5.0, 5 },
    { 10.0, 5 },
    { 30.0, 3 },
    { 60.0, 4 },
    { 120.0, 4 },
    { 300.0, 5 },
    { 600.0, 5 },
    { 1200.0, 4 },
    { 1800.0, 3 },
    { 3600.0, 4 },
    { 7200.0, 4 },
} };
} // namespace

RulerStep chooseRulerStep (const VisibleRange& range,
                           double width,
                           const std::function<double (const juce::String& label)>& roomForLabel)
{
    if (range.getLength() <= 0.0 || width <= 0.0)
        return rulerSteps.back();

    const auto fits = [&] (const RulerStep& step)
    {
        const auto spacing = step.seconds * width / range.getLength();
        // Tolerates rounding, so a step exactly as wide as the room its labels need fits.
        return spacing >= roomForLabel (formatRulerTime (range.getEnd(), step.showsTenths())) * (1.0 - 1e-9);
    };

    for (const auto& step : rulerSteps)
        if (fits (step))
            return step;

    // Past the series (sources of many hours in a narrow view): keep doubling until the labels fit.
    auto step = rulerSteps.back();

    while (! fits (step) && step.seconds < range.getLength())
        step.seconds *= 2.0;

    return step;
}

juce::String formatRulerTime (double seconds, bool withTenths)
{
    // Counts in whole tenths (or seconds) first, so 4.4999... reads 0:04.5 and 59.99 reads 1:00.0.
    const auto unitsPerSecond = withTenths ? 10 : 1;
    const auto units = (juce::int64) std::llround (std::max (0.0, seconds) * unitsPerSecond);
    const auto wholeSeconds = units / unitsPerSecond;
    auto text = juce::String (wholeSeconds / 60) + ":" + juce::String (wholeSeconds % 60).paddedLeft ('0', 2);

    if (withTenths)
        text << "." << juce::String (units % unitsPerSecond);

    return text;
}
} // namespace diffuscore
