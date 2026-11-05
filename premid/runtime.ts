// PreMiD ActivityType and getTimestamps, from PreMiD/Activities (MPL-2.0).
// Source: https://github.com/PreMiD/Activities/tree/main/premid/src
// License: https://github.com/PreMiD/Activities/blob/main/LICENSE
// Vendored to allow an offline build of this activity's two runtime imports.

export enum ActivityType {
  /**
   * Playing {name}
   */
  Playing = 0,
  /**
   * Streaming {name}
   */
  Streaming = 1,
  /**
   * Listening to {name}
   */
  Listening = 2,
  /**
   * Watching {name}
   */
  Watching = 3,
  /**
   * Competing in {name}
   */
  Competing = 5,
}

/**
 * Converts current media time and duration into Unix timestamps
 * @param {number} elementTime Current playback position in seconds
 * @param {number} elementDuration Total duration of the media in seconds
 * @returns {[number, number]} Array containing [startTimestamp, endTimestamp] as Unix timestamps in seconds
 */
export function getTimestamps(
  elementTime: number,
  elementDuration: number,
): [startTimestamp: number, endTimestamp: number] {
  const startTime = (Date.now() / 1000) - elementTime
  const endTime = startTime + elementDuration
  return [Math.floor(startTime), Math.floor(endTime)]
}
