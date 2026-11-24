#pragma once

#include "Source.h"

#include <juce_audio_formats/juce_audio_formats.h>

#include <functional>
#include <memory>
#include <optional>

namespace diffuscore
{
/** The outcome of loading a Source: a Source, a refusal explaining why not, or a cancelled load. */
struct SourceLoadResult
{
    static SourceLoadResult loaded (std::unique_ptr<Source> source);
    static SourceLoadResult refused (juce::String reason);
    static SourceLoadResult cancelledLoad();

    std::unique_ptr<Source> source; // set only when loaded
    juce::String refusal;           // set only when refused
    bool cancelled = false;
};

/** The file patterns DiffuScore can open, e.g. "*.wav;*.aiff;*.flac", from JUCE's registerBasicFormats(). */
juce::String supportedFileWildcard();

/** What a reader reports about an audio file before it is decoded. */
struct SourceFormat
{
    int numChannels = 0;
    juce::int64 lengthInFrames = 0;
    double sampleRate = 0.0;
};

/** The size of the file once decoded into RAM: frames × channels × 4 bytes (ADR-0003). */
juce::uint64 estimatedDecodedBytes (const SourceFormat& format);

/** Why a file with this format can't become a Source, or nothing if it can be decoded. */
std::optional<juce::String> refusalBeforeDecoding (const SourceFormat& format, juce::uint64 availableRamBytes);

/** Called during decoding with the progress so far (0 to 1). Returning false stops the decoding. */
using DecodeProgressCallback = std::function<bool (double progress)>;

/** Checks the reader's format, then decodes the whole file into a Source. */
SourceLoadResult decodeSource (juce::AudioFormatReader& reader,
                               const juce::String& fileName,
                               juce::uint64 availableRamBytes,
                               const DecodeProgressCallback& onProgress = {});

/** Opens an audio file in any format JUCE's registerBasicFormats() supports, checks it, then decodes it into a Source. */
SourceLoadResult loadSourceFile (const juce::File& file,
                                 juce::uint64 availableRamBytes,
                                 const DecodeProgressCallback& onProgress = {});
} // namespace diffuscore
