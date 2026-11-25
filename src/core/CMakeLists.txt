# Logic with no GUI and no audio device. Must never depend on a juce_gui_* module.
add_library(diffuscore_core STATIC
    AvailableMemory.cpp
    Follow.cpp
    Overview.cpp
    Preferences.cpp
    SourceLoading.cpp
    Spectrogram.cpp
    TimeRuler.cpp
    Transport.cpp
    VisibleRange.cpp
    Version.cpp)

target_include_directories(diffuscore_core PUBLIC
    ${CMAKE_CURRENT_SOURCE_DIR})

# A source property, not a target definition, so it is not re-exported below.
set_source_files_properties(Version.cpp PROPERTIES
    COMPILE_DEFINITIONS DIFFUSCORE_VERSION_STRING="${PROJECT_VERSION}")

# JUCE modules must be linked PRIVATE (see JUCE's "CMake API.md"); their include
# paths and definitions are re-exported below so consumers can use JUCE headers.
#
# JUCE adds a module's sources to every target that links it, so the app, which
# links the juce_gui_* modules (and through them these ones), compiles its own
# copy of these modules too. The linker resolves the app's JUCE symbols from
# the app's own objects and never pulls core's copy; diffuscore_tests uses
# core's copy. Both copies share diffuscore_juce_config, so every JUCE_* option
# that changes behaviour or layout must be set there, never on a single target.
target_link_libraries(diffuscore_core
    PRIVATE
        juce::juce_core
        juce::juce_audio_basics
        juce::juce_audio_formats
        juce::juce_dsp
    PUBLIC
        diffuscore_juce_config
        juce::juce_recommended_config_flags
        juce::juce_recommended_warning_flags)

target_include_directories(diffuscore_core INTERFACE
    $<TARGET_PROPERTY:diffuscore_core,INCLUDE_DIRECTORIES>)
target_compile_definitions(diffuscore_core INTERFACE
    $<TARGET_PROPERTY:diffuscore_core,COMPILE_DEFINITIONS>)
