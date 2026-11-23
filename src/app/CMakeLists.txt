juce_add_gui_app(DiffuScore
    PRODUCT_NAME "DiffuScore"
    COMPANY_NAME "DiffuScore"
    NEEDS_WEB_BROWSER FALSE
    NEEDS_CURL FALSE)

target_sources(DiffuScore PRIVATE
    Main.cpp
    MainWindow.cpp
    MainComponent.cpp)

target_compile_definitions(DiffuScore PRIVATE
    JUCE_APPLICATION_NAME_STRING="$<TARGET_PROPERTY:DiffuScore,JUCE_PRODUCT_NAME>"
    JUCE_APPLICATION_VERSION_STRING="$<TARGET_PROPERTY:DiffuScore,JUCE_VERSION>")

# diffuscore_core also brings diffuscore_juce_config and JUCE's recommended flags.
target_link_libraries(DiffuScore
    PRIVATE
        diffuscore_core
        juce::juce_audio_devices
        juce::juce_gui_extra
        juce::juce_recommended_lto_flags)
