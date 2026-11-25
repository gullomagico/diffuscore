# DiffuScore

A desktop application where performers of acousmatic music build personal diffusion scores: visual representations of a fixed stereo (or mono) piece, used to guide its spatialization over a loudspeaker orchestra (acousmonium). During the concert, DiffuScore also plays the piece to the diffusion desk.

## Documents

**Score**:
The document a performer creates and edits for one piece. A Score is built on exactly one Source.
_Avoid_: Project, session, track

**Source**:
The stereo or mono PCM audio a Score is built on, as loaded into DiffuScore.
_Avoid_: Track, clip, file, audio

**Playlist** _(planned)_:
An ordered collection of Scores, e.g. the movements of a long work or the programme of a concert.
_Avoid_: Setlist, project

## Modes

**Editor mode**:
The mode in which the performer builds and changes their Score, typically at home or in rehearsal.
_Avoid_: Edit view, authoring mode

**Performance mode** _(planned)_:
The mode in which the performer reads their Score while the Transport plays it to the diffusion desk during the concert. The Score cannot be changed in this mode.
_Avoid_: Live mode, concert mode, show mode

## Audio

**Channel**:
One signal of a Source: L and R for stereo, or a single Mono channel.
_Avoid_: Track, canal

**Transport**:
Playing the Source to the audio device: Play/Pause, Stop (back to the start), jumping to a point, and the position reached. At the end of the Source, playback stops there; the next Play starts from the beginning.
_Avoid_: Player, deck

## Display

**Spectrogram**:
The levels of a whole Source over time and frequency, as shown in the main window. For stereo, the two Channels' energies are added, so material in antiphase between L and R stays visible.
_Avoid_: Sonogram, waveform

**Zoom**:
How much of the Source's duration the Spectrogram shows across its width, from the whole Source down to fine detail. Zoom acts on time only; the frequency axis always shows the full range.
_Avoid_: Magnification, scale

**Visible Range**:
The stretch of the Source, from one time to another, that the Spectrogram currently shows.
_Avoid_: Viewport, window, view, selection

**Follow**:
The Visible Range keeping the Playhead in view while the Transport plays.
_Avoid_: Auto-scroll, lock, chase, track

**Overview**:
The whole Source in miniature, with the Visible Range marked on it.
_Avoid_: Minimap, navigator

**Playhead**:
The line over the Spectrogram marking the Transport's position in the Source.
_Avoid_: Cursor, marker
