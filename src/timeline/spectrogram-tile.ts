// The pure detail tile builder (ADR-0001): one FFT per column, no pooling. The window, row mapping,
// normalisation, quantisation and zero padding are the overview's (spectrogram.ts). The tile worker
// is a thin shell around buildDetailTiles; everything here is plain data.
import { TILE_COLUMNS, columnCount, tileColumns } from './detail-tile'
import type { DetailLevel, DetailTile, SpectrogramKind } from './detail-tile'
import { createFrameAnalyzer, quantizeColumn, totalPower } from './spectrogram'
import { SPECTROGRAM_ROWS } from './frequency-axis'

/** Channel indices whose FFTs a kind needs. */
function channelsNeeded(kind: SpectrogramKind): number[] {
  return kind === 'L' || kind === 'Mono' ? [0] : kind === 'R' ? [1] : [0, 1]
}

/**
 * Builds tile `index` of `level` for each requested kind, in request order. A column c covers
 * [c / level, (c + 1) / level) seconds and is one FFT centred on its centre time, rounded to the
 * nearest sample. Only the Channels the kinds need are analysed; Total is derived from the same
 * FFTs as L and R. Throws for a kind the Source's Channels cannot give, or an index outside the level.
 */
export function buildDetailTiles(
  channels: readonly Float32Array[],
  sampleRate: number,
  level: DetailLevel,
  index: number,
  kinds: readonly SpectrogramKind[],
): DetailTile[] {
  const stereo = channels.length === 2
  if (!stereo && channels.length !== 1)
    throw new Error(`Unsupported Channel count ${channels.length}`)
  for (const kind of kinds) {
    if (stereo ? kind === 'Mono' : kind !== 'Mono') {
      throw new Error(`Kind ${kind} is not available for a ${stereo ? 'stereo' : 'Mono'} Source`)
    }
  }
  const length = channels[0]!.length
  const columns = tileColumns(columnCount(length, sampleRate, level), index)
  if (columns === 0) throw new Error(`Tile ${index} is outside level ${level}`)

  const needed = [...new Set(kinds.flatMap(channelsNeeded))]
  const needsTotal = kinds.includes('Total')
  const analyzer = createFrameAnalyzer(sampleRate)
  const powers = channels.map(() => new Float64Array(analyzer.bins))
  const total = new Float64Array(analyzer.bins)
  const rows = new Float64Array(SPECTROGRAM_ROWS)
  const tiles = kinds.map<DetailTile>((kind) => ({
    kind,
    level,
    index,
    columns,
    data: new Uint8Array(columns * SPECTROGRAM_ROWS),
  }))

  for (let c = 0; c < columns; c++) {
    const column = index * TILE_COLUMNS + c
    const centre = Math.round(((column + 0.5) / level) * sampleRate)
    for (const ch of needed) analyzer.analyze(channels[ch]!, centre, powers[ch]!)
    if (needsTotal) totalPower(powers[0]!, powers[1]!, total)
    for (const tile of tiles) {
      const power = tile.kind === 'Total' ? total : powers[channelsNeeded(tile.kind)[0]!]!
      analyzer.mapRows(power, rows)
      quantizeColumn(rows, tile.data, c * SPECTROGRAM_ROWS)
    }
  }
  return tiles
}
