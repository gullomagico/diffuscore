#include <catch2/catch_test_macros.hpp>
#include <catch2/generators/catch_generators.hpp>
#include <catch2/matchers/catch_matchers_floating_point.hpp>
#include <catch2/matchers/catch_matchers_string.hpp>

#include <SourceLoading.h>

using namespace diffuscore;
using Catch::Matchers::ContainsSubstring;
using Catch::Matchers::WithinULP; // WithinULP (x, 0) is a bit-exact comparison

namespace
{
constexpr juce::uint64 plentyOfRam = juce::uint64 { 64 } << 30;

/** A 32-bit float WAV in memory, so decoded samples compare exactly. */
juce::MemoryBlock makeWav (const juce::AudioBuffer<float>& samples, double sampleRate)
{
    juce::MemoryBlock wav;
    std::unique_ptr<juce::OutputStream> stream = std::make_unique<juce::MemoryOutputStream> (wav, false);

    auto writer = juce::WavAudioFormat().createWriterFor (stream,
                                                          juce::AudioFormatWriterOptions()
                                                              .withSampleRate (sampleRate)
                                                              .withNumChannels (samples.getNumChannels())
                                                              .withBitsPerSample (32)
                                                              .withSampleFormat (juce::AudioFormatWriterOptions::SampleFormat::floatingPoint));
    REQUIRE (writer != nullptr);
    REQUIRE (writer->writeFromAudioSampleBuffer (samples, 0, samples.getNumSamples()));
    writer.reset(); // flushes the header
    return wav;
}

/** A 16-bit file written by the given format into a temporary file. */
void writeFile (juce::AudioFormat& format, const juce::File& file, const juce::AudioBuffer<float>& samples, double sampleRate)
{
    std::unique_ptr<juce::OutputStream> stream = std::make_unique<juce::FileOutputStream> (file);

    auto writer = format.createWriterFor (stream,
                                          juce::AudioFormatWriterOptions()
                                              .withSampleRate (sampleRate)
                                              .withNumChannels (samples.getNumChannels())
                                              .withBitsPerSample (16));
    REQUIRE (writer != nullptr);
    REQUIRE (writer->writeFromAudioSampleBuffer (samples, 0, samples.getNumSamples()));
}

std::unique_ptr<juce::AudioFormatReader> readerFor (const juce::MemoryBlock& wav)
{
    std::unique_ptr<juce::AudioFormatReader> reader (
        juce::WavAudioFormat().createReaderFor (new juce::MemoryInputStream (wav, true), true));
    REQUIRE (reader != nullptr);
    return reader;
}
} // namespace

TEST_CASE ("Mono and stereo files pass the pre-decode checks", "[source]")
{
    CHECK_FALSE (refusalBeforeDecoding ({ 1, 48000, 48000.0 }, plentyOfRam).has_value());
    CHECK_FALSE (refusalBeforeDecoding ({ 2, 48000, 48000.0 }, plentyOfRam).has_value());
}

TEST_CASE ("Files with no Channels or no frames are refused", "[source]")
{
    CHECK (refusalBeforeDecoding ({ 0, 48000, 48000.0 }, plentyOfRam).has_value());
    CHECK (refusalBeforeDecoding ({ 2, 0, 48000.0 }, plentyOfRam).has_value());
}

TEST_CASE ("A folder is refused with a message", "[source]")
{
    const auto result = loadSourceFile (juce::File::getSpecialLocation (juce::File::tempDirectory), plentyOfRam);

    CHECK (result.source == nullptr);
    CHECK_THAT (result.refusal.toStdString(), ContainsSubstring ("is a folder"));
}

TEST_CASE ("Files with more than 2 Channels are refused", "[source]")
{
    const auto refusal = refusalBeforeDecoding ({ 6, 48000, 48000.0 }, plentyOfRam);

    REQUIRE (refusal.has_value());
    CHECK_THAT (refusal->toStdString(), ContainsSubstring ("DiffuScore supports mono and stereo files"));
}

TEST_CASE ("A file whose decoded size exceeds the available RAM is refused", "[source]")
{
    // 1000 stereo frames take 8000 bytes as 32-bit float.
    CHECK_FALSE (refusalBeforeDecoding ({ 2, 1000, 48000.0 }, 8000).has_value());
    CHECK (refusalBeforeDecoding ({ 2, 1000, 48000.0 }, 7999).has_value());
}

TEST_CASE ("The RAM refusal states the decoded size and the available RAM", "[source]")
{
    // 30 minutes of stereo at 48 kHz: 691,200,000 bytes (ADR-0003).
    const SourceFormat thirtyMinutesStereo { 2, 30 * 60 * 48000, 48000.0 };

    const auto refusal = refusalBeforeDecoding (thirtyMinutesStereo, juce::uint64 { 512 } << 20);

    REQUIRE (refusal.has_value());
    CHECK_THAT (refusal->toStdString(), ContainsSubstring ("659.2 MB"));
    CHECK_THAT (refusal->toStdString(), ContainsSubstring ("512.0 MB"));
}

TEST_CASE ("Decoding a stereo WAV yields a Source with its rate, Channels, length and samples", "[source]")
{
    juce::AudioBuffer<float> samples (2, 3);
    const float left[] = { 0.5f, -0.25f, 0.125f };
    const float right[] = { -1.0f, 0.0f, 0.75f };
    samples.copyFrom (0, 0, left, 3);
    samples.copyFrom (1, 0, right, 3);
    auto reader = readerFor (makeWav (samples, 48000.0));

    const auto result = decodeSource (*reader, "piece.wav", plentyOfRam);

    REQUIRE (result.source != nullptr);
    const auto& source = *result.source;
    CHECK (source.fileName == "piece.wav");
    CHECK_THAT (source.sampleRate, WithinULP (48000.0, 0));
    CHECK (source.samples.getNumChannels() == 2);
    CHECK (source.samples.getNumSamples() == 3);
    for (int i = 0; i < 3; ++i)
    {
        CHECK_THAT (source.samples.getSample (0, i), WithinULP (left[i], 0));
        CHECK_THAT (source.samples.getSample (1, i), WithinULP (right[i], 0));
    }
}

TEST_CASE ("A 44.1 kHz file stays 44.1 kHz in the Source", "[source]")
{
    juce::AudioBuffer<float> samples (1, 441);
    samples.clear();
    auto reader = readerFor (makeWav (samples, 44100.0));

    const auto result = decodeSource (*reader, "mono.wav", plentyOfRam);

    REQUIRE (result.source != nullptr);
    CHECK_THAT (result.source->sampleRate, WithinULP (44100.0, 0));
    CHECK (result.source->samples.getNumChannels() == 1);
    CHECK (result.source->samples.getNumSamples() == 441);
}

TEST_CASE ("Decoding refuses a file that fails the pre-decode checks", "[source]")
{
    juce::AudioBuffer<float> samples (6, 10);
    samples.clear();
    auto reader = readerFor (makeWav (samples, 48000.0));

    const auto result = decodeSource (*reader, "surround.wav", plentyOfRam);

    CHECK (result.source == nullptr);
    CHECK_THAT (result.refusal.toStdString(), ContainsSubstring ("DiffuScore supports mono and stereo files"));
}

TEST_CASE ("A file longer than a Source can hold is refused", "[source]")
{
    // A Source holds at most 2^31 - 1 frames (about 12.4 hours at 48 kHz).
    CHECK (refusalBeforeDecoding ({ 1, juce::int64 { 1 } << 31, 48000.0 }, plentyOfRam).has_value());
    CHECK_FALSE (refusalBeforeDecoding ({ 1, (juce::int64 { 1 } << 31) - 1, 48000.0 }, plentyOfRam).has_value());
}

TEST_CASE ("Loading a WAV file names the Source after the file", "[source]")
{
    juce::AudioBuffer<float> samples (2, 100);
    samples.clear();
    const juce::TemporaryFile file (".wav");
    const auto wav = makeWav (samples, 96000.0);
    REQUIRE (file.getFile().replaceWithData (wav.getData(), wav.getSize()));

    const auto result = loadSourceFile (file.getFile(), plentyOfRam);

    REQUIRE (result.source != nullptr);
    CHECK (result.source->fileName == file.getFile().getFileName());
    CHECK_THAT (result.source->sampleRate, WithinULP (96000.0, 0));
    CHECK (result.source->samples.getNumSamples() == 100);
}

TEST_CASE ("FLAC and AIFF files load at their native rate", "[source]")
{
    // 0.5 and -0.25 are exact in 16-bit PCM.
    juce::AudioBuffer<float> samples (1, 2);
    samples.setSample (0, 0, 0.5f);
    samples.setSample (0, 1, -0.25f);

    const auto formatName = GENERATE (as<std::string> {}, "FLAC", "AIFF");
    CAPTURE (formatName);
    const std::unique_ptr<juce::AudioFormat> format = formatName == "FLAC"
                                                        ? std::unique_ptr<juce::AudioFormat> (std::make_unique<juce::FlacAudioFormat>())
                                                        : std::make_unique<juce::AiffAudioFormat>();
    const juce::TemporaryFile file (format->getFileExtensions()[0]);
    writeFile (*format, file.getFile(), samples, 44100.0);

    const auto result = loadSourceFile (file.getFile(), plentyOfRam);

    REQUIRE (result.source != nullptr);
    CHECK_THAT (result.source->sampleRate, WithinULP (44100.0, 0));
    CHECK (result.source->getNumChannels() == 1);
    REQUIRE (result.source->getLengthInFrames() == 2);
    CHECK_THAT (result.source->samples.getSample (0, 0), WithinULP (0.5f, 0));
    CHECK_THAT (result.source->samples.getSample (0, 1), WithinULP (-0.25f, 0));
}

TEST_CASE ("A file that isn't audio is refused", "[source]")
{
    const juce::TemporaryFile file (".wav");
    REQUIRE (file.getFile().replaceWithText ("These are not samples."));

    const auto result = loadSourceFile (file.getFile(), plentyOfRam);

    CHECK (result.source == nullptr);
    CHECK_THAT (result.refusal.toStdString(), ContainsSubstring ("not a supported audio file"));
}

TEST_CASE ("A file that can't be read is refused", "[source]")
{
    const auto missing = juce::File::getSpecialLocation (juce::File::tempDirectory).getNonexistentChildFile ("missing", ".wav");

    const auto result = loadSourceFile (missing, plentyOfRam);

    CHECK (result.source == nullptr);
    CHECK_THAT (result.refusal.toStdString(), ContainsSubstring ("could not be opened"));
}

TEST_CASE ("Decoding reports progress and stops when asked to", "[source]")
{
    juce::AudioBuffer<float> samples (1, 200000);
    samples.clear();
    auto reader = readerFor (makeWav (samples, 48000.0));
    std::vector<double> reported;

    const auto result = decodeSource (*reader, "long.wav", plentyOfRam, [&] (double progress)
                                      {
                                          reported.push_back (progress);
                                          return false;
                                      });

    CHECK (result.source == nullptr);
    CHECK (result.cancelled);
    REQUIRE (reported.size() == 1);
    CHECK (reported.front() > 0.0);
    CHECK (reported.front() < 1.0);
}

TEST_CASE ("Decoding reports progress up to completion", "[source]")
{
    juce::AudioBuffer<float> samples (1, 200000);
    samples.clear();
    auto reader = readerFor (makeWav (samples, 48000.0));
    std::vector<double> reported;

    const auto result = decodeSource (*reader, "long.wav", plentyOfRam, [&] (double progress)
                                      {
                                          reported.push_back (progress);
                                          return true;
                                      });

    REQUIRE (result.source != nullptr);
    CHECK_FALSE (result.cancelled);
    REQUIRE (reported.size() > 1);
    CHECK (std::is_sorted (reported.begin(), reported.end()));
    CHECK_THAT (reported.back(), WithinULP (1.0, 0));
}
