#include <catch2/catch_test_macros.hpp>

#include <AvailableMemory.h>

TEST_CASE ("Available RAM is more than nothing and at most the total RAM", "[memory]")
{
    const auto total = (juce::uint64) juce::SystemStats::getMemorySizeInMegabytes() << 20;

    const auto available = diffuscore::availableRamBytes();

    CHECK (available > 0);
    // getMemorySizeInMegabytes() rounds, so allow 1 MB of slack.
    CHECK (available <= total + (juce::uint64 { 1 } << 20));
}
