#include "PreferencesComponent.h"

namespace diffuscore
{
namespace
{
// ComboBox item IDs (never 0, which means no selection)
constexpr int pageTurnId = 1;
constexpr int continuousScrollingId = 2;

constexpr int margin = 16;
constexpr int rowHeight = 24;
constexpr int labelWidth = 280;
constexpr int controlWidth = 240;
constexpr int rowGap = 8;
} // namespace

PreferencesComponent::PreferencesComponent (const Preferences& initial)
    : preferences (initial)
{
    followStyleBox.addItem ("Page turn", pageTurnId);
    followStyleBox.addItem ("Continuous scrolling", continuousScrollingId);
    followStyleBox.setSelectedId (preferences.editor.style == FollowStyle::continuousScrolling ? continuousScrollingId : pageTurnId,
                                  juce::dontSendNotification);
    followStyleBox.onChange = [this] { changed(); };

    // Shown in percent of the width; stored as a fraction.
    playheadPositionSlider.setRange (Follow::minPlayheadFraction * 100.0, Follow::maxPlayheadFraction * 100.0, 1.0);
    playheadPositionSlider.setTextValueSuffix ("%");
    playheadPositionSlider.setValue (juce::roundToInt (preferences.editor.playheadFraction * 100.0), juce::dontSendNotification);
    playheadPositionSlider.onValueChange = [this] { changed(); };

    editorModeHeading.setFont (juce::FontOptions (16.0f).withStyle ("Bold"));

    for (auto* label : { &editorModeHeading, &followStyleLabel, &playheadPositionLabel })
        addAndMakeVisible (label);

    addAndMakeVisible (followStyleBox);
    addAndMakeVisible (playheadPositionSlider);
    updateEnablement();

    setSize (2 * margin + labelWidth + controlWidth, 2 * margin + 3 * rowHeight + 2 * rowGap);
}

void PreferencesComponent::changed()
{
    preferences.editor.style = followStyleBox.getSelectedId() == continuousScrollingId ? FollowStyle::continuousScrolling : FollowStyle::pageTurn;

    // Unchanged unless moved, so the default one third is not rounded to 33% just by changing the style.
    if (const auto shown = juce::roundToInt (preferences.editor.playheadFraction * 100.0); ! juce::exactlyEqual (playheadPositionSlider.getValue(), (double) shown))
        preferences.editor.playheadFraction = playheadPositionSlider.getValue() / 100.0;

    updateEnablement();

    if (onChange != nullptr)
        onChange (preferences);
}

void PreferencesComponent::updateEnablement()
{
    const auto isContinuous = preferences.editor.style == FollowStyle::continuousScrolling;
    playheadPositionLabel.setEnabled (isContinuous);
    playheadPositionSlider.setEnabled (isContinuous);
}

void PreferencesComponent::resized()
{
    auto area = getLocalBounds().reduced (margin);

    editorModeHeading.setBounds (area.removeFromTop (rowHeight));
    area.removeFromTop (rowGap);

    auto followRow = area.removeFromTop (rowHeight);
    followStyleLabel.setBounds (followRow.removeFromLeft (labelWidth));
    followStyleBox.setBounds (followRow);

    area.removeFromTop (rowGap);
    auto positionRow = area.removeFromTop (rowHeight);
    playheadPositionLabel.setBounds (positionRow.removeFromLeft (labelWidth));
    playheadPositionSlider.setBounds (positionRow);
}
} // namespace diffuscore
