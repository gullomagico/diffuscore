# DiffuScore

A web editor where performers of acousmatic music build personal diffusion scores: visual representations of a fixed stereo piece, used to guide its spatialization over a loudspeaker orchestra.

## Documents

**Score**:
The document a performer creates and edits for one piece. A Score is built on exactly one Source.
_Avoid_: Project, session, track

**Source**:
The stereo (or mono) audio a Score is built on, as imported into DiffuScore and held decoded at the application's working sample rate.
_Avoid_: Track, clip, file, audio

**Playlist** _(planned)_:
An ordered collection of Scores, e.g. the movements of a long work or the programme of a concert.
_Avoid_: Setlist, project

## Audio

**Channel**:
One signal of a Source: L and R for stereo, or a single Mono channel.
_Avoid_: Track, canal

**Total spectrogram**:
A single spectrogram representing the energy of both Channels together, without cancellation between them. Only a stereo Source has one: a Mono Source has just the spectrogram of its single Channel.
_Avoid_: Mid spectrogram, sum spectrogram

## Workspace

**Timeline**:
The horizontal time axis on which every Lane, and later every annotation, of a Score is laid out.

**Viewport**:
The portion of the Timeline currently visible: which time range is shown and at what zoom.
_Avoid_: View, window, camera

**Lane**:
One horizontal band of the Timeline showing one or more representations (waveform, spectrogram) of one or more Channels, layered one over the other.
_Avoid_: Track, row, strip

**Mirrored waveform**:
A waveform Lane where R is drawn above a shared zero line and L below it, so the energy of the two Channels can be compared at a glance.
_Avoid_: Butterfly, split waveform

**Preset**:
A named arrangement of Lanes on the Timeline (Overlay, Stacked, Spectrogram only, Waveforms only).
_Avoid_: Layout, view mode, template
