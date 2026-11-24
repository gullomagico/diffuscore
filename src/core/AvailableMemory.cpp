#include "AvailableMemory.h"

#include <optional>

#if JUCE_WINDOWS
 #ifndef NOMINMAX
  #define NOMINMAX
 #endif
 #ifndef WIN32_LEAN_AND_MEAN
  #define WIN32_LEAN_AND_MEAN
 #endif
 #include <windows.h>
#elif JUCE_MAC
 #include <mach/mach.h>
#endif

namespace diffuscore
{
namespace
{
juce::uint64 totalRamBytes()
{
    return (juce::uint64) juce::SystemStats::getMemorySizeInMegabytes() << 20;
}

#if JUCE_LINUX
std::optional<juce::uint64> queryAvailableRamBytes()
{
    // A line of /proc/meminfo looks like "MemAvailable:    7340032 kB".
    juce::StringArray lines;
    lines.addLines (juce::File ("/proc/meminfo").loadFileAsString());

    for (const auto& line : lines)
        if (line.startsWith ("MemAvailable:"))
            return (juce::uint64) line.fromFirstOccurrenceOf (":", false, false).trim().getLargeIntValue() << 10;

    return std::nullopt;
}
#elif JUCE_WINDOWS
std::optional<juce::uint64> queryAvailableRamBytes()
{
    // NOT YET COMPILED: Windows builds arrive with the first release (ADR-0001).
    MEMORYSTATUSEX status {};
    status.dwLength = sizeof (status);

    if (! GlobalMemoryStatusEx (&status))
        return std::nullopt;

    return (juce::uint64) status.ullAvailPhys;
}
#elif JUCE_MAC
std::optional<juce::uint64> queryAvailableRamBytes()
{
    // NOT YET COMPILED: macOS builds arrive with the first release (ADR-0001).
    // macOS keeps few pages free on purpose and fills the rest with cache, so free
    // pages alone understate what can be allocated. Inactive pages are cache the
    // system reclaims on demand, so they count as available too.
    const auto host = mach_host_self();

    vm_size_t pageSize = 0;
    vm_statistics64_data_t stats {};
    mach_msg_type_number_t count = HOST_VM_INFO64_COUNT;

    const auto ok = host_page_size (host, &pageSize) == KERN_SUCCESS
                 && host_statistics64 (host, HOST_VM_INFO64, (host_info64_t) &stats, &count) == KERN_SUCCESS;

    mach_port_deallocate (mach_task_self(), host);

    if (! ok)
        return std::nullopt;

    return ((juce::uint64) stats.free_count + (juce::uint64) stats.inactive_count) * (juce::uint64) pageSize;
}
#else
std::optional<juce::uint64> queryAvailableRamBytes()
{
    return std::nullopt;
}
#endif
} // namespace

juce::uint64 availableRamBytes()
{
    // If the query fails, fall back to total RAM: the check stays permissive
    // rather than refusing files it can't judge.
    return queryAvailableRamBytes().value_or (totalRamBytes());
}
} // namespace diffuscore
