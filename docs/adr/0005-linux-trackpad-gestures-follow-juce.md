# Linux trackpad gestures follow JUCE's limits

JUCE 9's X11 backend (which DiffuScore also runs through on Wayland, via XWayland) maps only pointer buttons 4/5 to the mouse wheel: horizontal scroll (buttons 6/7) is discarded, and it has no pinch support (only the macOS and Windows peers raise magnify gestures). So on Linux a two-finger horizontal swipe and a pinch never reach the Spectrogram. We accept this rather than patch JUCE: on Linux, Ctrl + wheel (or Ctrl + two-finger scroll) zooms and Shift + wheel moves the Visible Range; the horizontal-scroll and pinch handlers stay for macOS and Windows.

## Considered Options

- **Patch JUCE through FetchContent's PATCH_COMMAND** (buttons 6/7 → horizontal wheel; XInput 2.4 pinch → magnify): gives Linux performers the same gestures, but means carrying a patch against a third-party framework across JUCE upgrades. Revisit if JUCE gains these upstream or Linux performers ask for them.

## Consequences

- Manual checks of trackpad gestures apply to macOS and Windows only; on Linux, check the Ctrl + wheel and Shift + wheel equivalents.
