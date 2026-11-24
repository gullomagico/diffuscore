#pragma once

#include <juce_core/juce_core.h>

namespace diffuscore
{
/** The RAM currently available to a new allocation, in bytes (ADR-0003).

    Linux: the kernel's MemAvailable. Windows: GlobalMemoryStatusEx's available physical
    memory. macOS: free plus inactive pages. If the query fails, the total physical RAM.
*/
juce::uint64 availableRamBytes();
} // namespace diffuscore
