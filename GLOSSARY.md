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

## Audio

**Channel**:
One signal of a Source: L and R for stereo, or a single Mono channel.
_Avoid_: Track, canal

## Display

**Spectrogram**:
The levels of a whole Source over time and frequency, as shown in the main window. For stereo, the two Channels' energies are added, so material in antiphase between L and R stays visible.
_Avoid_: Sonogram, waveform
