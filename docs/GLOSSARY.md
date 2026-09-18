# Glossary

The vocabulary used in code, tests and documents. One name per concept; no synonyms in code.

| Term                 | Meaning                                                                                                                                                                |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Recording            | One capture as the camera stored it: one `.insv` file, or the `_00_`/`_10_` pair of older cameras, plus the trailer metadata.                                          |
| Trailer              | Insta360's metadata block after the MP4 boxes, ending in the 72-byte footer with the magic string. Wrapped in an `inst` box on newer firmware, bare on older firmware. |
| Record               | One typed payload inside the trailer (info, gyro, exposure, thumbnail, ...), addressed by its record id.                                                               |
| Record locator       | Strategy that finds record payloads: through the index record, or by walking headers backwards.                                                                        |
| Info record          | Record id 1: the protobuf message with camera identity, calibration strings and timing fields. Parsed into a `RecordingInfo`.                                          |
| Calibration string   | The `offset`, `offset_v2` or `offset_v3` text describing each lens. Parsed into a `CalibrationSet`.                                                                    |
| Calibration set      | All lenses of a recording on a shared calibration canvas, with the version of the string it came from.                                                                 |
| Lens calibration     | One lens: its lens model, orientation (yaw, pitch, roll) and translation relative to lens 0.                                                                           |
| Lens model           | Strategy mapping a direction in the lens frame to a pixel on the calibration canvas: MEI, polynomial or equidistant.                                                   |
| Calibration canvas   | The pixel space the calibration is expressed in: lens images side by side (10752 x 5376 on the X5). Track pixels are a scaled window of it.                            |
| Lens frame           | Right-handed frame with x to the right, y down, z along the optical axis of one lens.                                                                                  |
| Field edge           | The half field of view beyond which a lens sees nothing; 100 degrees on X-series lenses.                                                                               |
| Gyro track           | All IMU samples of a recording: capture timestamp, acceleration (g), angular velocity (rad/s).                                                                         |
| Gyro sample layout   | Strategy for one sample's bytes: raw (20 bytes, offset-binary) or float (56 bytes).                                                                                    |
| Exposure record      | Record id 4: per captured frame, capture timestamp and shutter time.                                                                                                   |
| Capture clock        | The camera's monotonic microsecond clock shared by gyro samples, exposure entries and `first_frame_timestamp`.                                                         |
| Capture time         | The capture-clock timestamp of one frame's exposure start.                                                                                                             |
| Frame times          | Capture time, exposure and readout per encoded frame, aligned to the video track.                                                                                      |
| Lens layout          | How lens images are stored: multi-track (one file, one track per lens), split files (`_00_` and `_10_`), or packed (both circles in one frame).                        |
| Lens source          | Where one lens's pixels come from: an input, a track and a rectangle within the frame.                                                                                 |
| Random access source | Port for reading byte ranges from a file or URL.                                                                                                                       |
| Byte range           | An offset and a length in a source; end exclusive.                                                                                                                     |
| Stabilization mode   | How the gyro orientation is applied: off, lock, horizon, follow.                                                                                                       |
| Playback session     | The application use case that drives demuxing, decoding, timing and rendering for one recording.                                                                       |
| Frame pair           | The decoded pictures of every lens for one instant, in lens order; owned by whoever holds it and closed exactly once.                                                  |
| Frame pair queue     | Soft-capacity buffer of frame pairs between the decode pipeline and the renderer; the consumer takes the latest pair due at a time.                                    |
| Decode pipeline      | One run of lockstep decoding of all lens tracks from a chosen time, feeding pairs into a frame pair queue.                                                             |
| Start gate           | Filter at the head of a decode run: passes pairs at or after the start, keeps only the last pair before it (the frame on screen at the start).                         |
| Playback clock       | Port for the media time source playback follows: wall clock in core, an audio element in the browser.                                                                  |
| Frame sink           | Port that receives presentations from the playback session: the renderer, or a test double.                                                                            |
| Presentation         | One frame pair together with the media time it was shown at and, when known, its frame index.                                                                          |
| Player state         | The playback session's state machine: idle, ready, playing, paused, seeking, ended, error, disposed; every transition is in one table.                                 |
