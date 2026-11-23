# The whole Source is held in RAM

A Source is decoded entirely into memory (32-bit float) before it can be played, so playback never reads the disk during a concert. This costs about 700 MB for 30 minutes of stereo at 48 kHz, or 1.4 GB at 96 kHz. Before decoding, DiffuScore estimates the decoded size (frames × channels × 4 bytes) and refuses the file if it exceeds the RAM currently available.

## Considered Options

- **Stream from disk with a read-ahead buffer**: low memory use, but a disk stall or a slow external drive can cause a dropout on stage.

## Consequences

- **Planned:** when there isn't enough RAM, fall back to buffered disk streaming instead of refusing the file.
