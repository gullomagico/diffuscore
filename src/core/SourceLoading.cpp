#include "SourceLoading.h"

namespace diffuscore
{
namespace
{
constexpr int maxChannels = 2;

juce::String describeBytes (juce::uint64 bytes)
{
    return juce::File::descriptionOfSizeInBytes ((juce::int64) std::min<juce::uint64> (bytes, (juce::uint64) std::numeric_limits<juce::int64>::max()));
}

juce::String notEnoughMemory (const SourceFormat& format)
{
    return "Not enough memory to load this file: it needs " + describeBytes (estimatedDecodedBytes (format)) + " once decoded";
}

/** An AudioFormatManager with JUCE's basic formats (WAV, AIFF, FLAC, Ogg Vorbis, ...). */
struct BasicFormats : juce::AudioFormatManager
{
    BasicFormats() { registerBasicFormats(); }
};
} // namespace

SourceLoadResult SourceLoadResult::loaded (std::unique_ptr<Source> source)
{
    return { std::move (source), {}, false };
}

SourceLoadResult SourceLoadResult::refused (juce::String reason)
{
    return { nullptr, std::move (reason), false };
}

SourceLoadResult SourceLoadResult::cancelledLoad()
{
    return { nullptr, {}, true };
}

juce::String supportedFileWildcard()
{
    return BasicFormats().getWildcardForAllFormats();
}

juce::uint64 estimatedDecodedBytes (const SourceFormat& format)
{
    return (juce::uint64) std::max<juce::int64> (format.lengthInFrames, 0)
         * (juce::uint64) std::max (format.numChannels, 0)
         * sizeof (float);
}

std::optional<juce::String> refusalBeforeDecoding (const SourceFormat& format, juce::uint64 availableRamBytes)
{
    if (format.numChannels < 1 || format.lengthInFrames < 1)
        return juce::String ("This file contains no audio.");

    if (format.numChannels > maxChannels)
        return "DiffuScore supports mono and stereo files. This file has "
               + juce::String (format.numChannels) + " Channels.";

    if (format.lengthInFrames > std::numeric_limits<int>::max())
        return juce::String ("This file is too long: DiffuScore can load at most ")
               + juce::String (std::numeric_limits<int>::max()) + " frames per Channel.";

    if (estimatedDecodedBytes (format) > availableRamBytes)
        return notEnoughMemory (format) + ", but only " + describeBytes (availableRamBytes) + " of RAM is available.";

    return std::nullopt;
}

SourceLoadResult decodeSource (juce::AudioFormatReader& reader,
                               const juce::String& fileName,
                               juce::uint64 availableRamBytes,
                               const DecodeProgressCallback& onProgress)
{
    const SourceFormat format { (int) reader.numChannels, reader.lengthInSamples, reader.sampleRate };

    if (auto refusal = refusalBeforeDecoding (format, availableRamBytes))
        return SourceLoadResult::refused (*refusal);

    auto source = std::make_unique<Source>();
    source->fileName = fileName;
    source->sampleRate = format.sampleRate;

    try
    {
        source->samples.setSize (format.numChannels, (int) format.lengthInFrames);
    }
    catch (const std::bad_alloc&)
    {
        return SourceLoadResult::refused (notEnoughMemory (format) + ".");
    }

    constexpr int framesPerChunk = 1 << 16;
    const auto totalFrames = (int) format.lengthInFrames;

    for (int frame = 0; frame < totalFrames; frame += framesPerChunk)
    {
        const auto frames = std::min (framesPerChunk, totalFrames - frame);

        if (! reader.read (&source->samples, frame, frames, frame, true, true))
            return SourceLoadResult::refused ("The audio in this file could not be decoded.");

        if (onProgress && ! onProgress ((double) (frame + frames) / totalFrames))
            return SourceLoadResult::cancelledLoad();
    }

    return SourceLoadResult::loaded (std::move (source));
}

SourceLoadResult loadSourceFile (const juce::File& file, juce::uint64 availableRamBytes, const DecodeProgressCallback& onProgress)
{
    if (file.isDirectory())
        return SourceLoadResult::refused ("\"" + file.getFileName() + "\" is a folder, not an audio file.");

    auto stream = std::make_unique<juce::FileInputStream> (file);

    if (! file.existsAsFile() || ! stream->openedOk())
    {
        const auto reason = stream->getStatus().getErrorMessage();
        return SourceLoadResult::refused ("The file could not be opened"
                                          + (reason.isNotEmpty() ? ": " + reason : juce::String (".")));
    }

    BasicFormats formats;
    const std::unique_ptr<juce::AudioFormatReader> reader (formats.createReaderFor (std::move (stream)));

    if (reader == nullptr)
        return SourceLoadResult::refused ("This is not a supported audio file. DiffuScore opens "
                                          + formats.getWildcardForAllFormats().removeCharacters ("*").replace (";", ", ") + " files.");

    return decodeSource (*reader, file.getFileName(), availableRamBytes, onProgress);
}
} // namespace diffuscore
