#pragma once

#include <Preferences.h>

#include <juce_gui_basics/juce_gui_basics.h>

namespace diffuscore
{
/** The content of the Preferences window (ADR-0004): the performer's choices of how DiffuScore behaves,
    each reported through onChange as soon as it changes, so it can be applied and saved at once.

    Grouped by mode, each with its own settings. For now, Editor mode only: how Follow moves the Visible Range,
    and where the Playhead stays with continuous scrolling (only editable with continuous scrolling). */
class PreferencesComponent final : public juce::Component
{
public:
    explicit PreferencesComponent (const Preferences& initial);

    /** Called with all the Preferences whenever the performer changes one. */
    std::function<void (const Preferences&)> onChange;

    void resized() override;

private:
    void changed();
    void updateEnablement();

    Preferences preferences;
    juce::Label editorModeHeading { {}, "Editor mode" };
    juce::Label followStyleLabel { {}, "Follow" };
    juce::ComboBox followStyleBox;
    juce::Label playheadPositionLabel { {}, "Playhead position for continuous scrolling" };
    juce::Slider playheadPositionSlider { juce::Slider::LinearHorizontal, juce::Slider::TextBoxRight };

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (PreferencesComponent)
};
} // namespace diffuscore
