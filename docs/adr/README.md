# Architecture decision records

One record per non-obvious decision, with the context that led to it and, in most, the
alternatives considered. Each record's status line says when it was amended or superseded. A
new record takes the next number and a line here.

- [ADR 0001](0001-hexagonal-architecture.md): Hexagonal architecture with an enforced dependency rule
- [ADR 0002](0002-webcodecs-pipeline.md): Decode with WebCodecs, not with video elements
- [ADR 0003](0003-mediabunny-demuxer.md): mediabunny as the demuxer
- [ADR 0004](0004-detection-over-model-tables.md): Select format variants from the file, not from the camera model
- [ADR 0005](0005-lens-model-interpretations.md): Interpretation of the three calibration string versions
- [ADR 0006](0006-node-24-toolchain.md): Node 24 LTS for the toolchain
- [ADR 0007](0007-audio-clock-over-media-source-extensions.md): The audio element, fed through Media Source Extensions, is the master clock
- [ADR 0008](0008-stitching-conventions.md): Frames, lens poses and the canvas window used for stitching
- [ADR 0009](0009-imu-frame-and-orientation.md): IMU frame, orientation integration and stabilization modes
- [ADR 0010](0010-player-composition-and-embedding.md): A headless player composed at the element, embedded over a versioned message protocol
- [ADR 0011](0011-sound-follows-the-picture.md): Sound follows the picture through a buffering state
- [ADR 0012](0012-gain-matching-along-the-seam.md): Exposure matched along the seam ring, lens 0 the reference
- [ADR 0013](0013-byte-ranges-bypass-the-browser-cache.md): Byte-range reads bypass the browser's HTTP cache
- [ADR 0014](0014-the-frame-shows-the-whole-calibration-square.md): The encoded frame shows the whole calibration square
- [ADR 0015](0015-view-modes-replace-projections.md): View modes replace projections
- [ADR 0016](0016-the-player-owns-its-settings.md): The player owns its settings; attributes configure them
- [ADR 0017](0017-the-recording-itself-or-an-error.md): The recording itself or an error; the proxy never plays
- [ADR 0018](0018-every-view-mode-zooms-toward-the-pointer.md): Every view mode zooms toward the pointer
- [ADR 0019](0019-range-reads-ask-again.md): A range that fails on the way is asked for again
- [ADR 0020](0020-one-npm-package-bundles-the-core-and-the-adapters.md): One npm package, `@bubo-squared/gyroview`, bundles the core and the adapters
- [ADR 0021](0021-changes-are-announced-once-whole.md): Changes are announced once they are whole
- [ADR 0022](0022-the-player-opens-on-the-raw-lenses.md): The player opens on the raw lenses
- [ADR 0023](0023-the-legacy-radius-spans-96-degrees.md): The legacy radius spans 96 degrees, and the legacy string is the default reading
- [ADR 0024](0024-lens-sampling-reads-the-pixels-footprint.md): Lens sampling reads the pixel's footprint, at a quality the page chooses
- [ADR 0025](0025-the-lens-pose-as-measured-against-studio.md): The calibration's roll is read mirrored, and yaw and pitch turn the lenses in the body frame
- [ADR 0026](0026-the-seam-bent-by-its-disparity-a-trial.md): The seam bent by the disparity measured across it, a trial
- [ADR 0027](0027-credentials-follow-crossorigin.md): Credentials follow `crossorigin`, and go with the recording
- [ADR 0028](0028-the-controls-fit-the-player-and-the-pointer.md): The controls fit the player's width and the pointer
- [ADR 0029](0029-the-player-reads-the-sample-tables-and-downloads-the-bytes.md): The player reads the sample tables and downloads the bytes itself
- [ADR 0030](0030-errors-say-whose-side-they-are-on.md): Errors say whose side they are on; a browser without WebCodecs has its own code
- [ADR 0031](0031-private-samples-stay-local.md): A recording shared privately stays local; the tests learn it from a git-ignored catalogue
- [ADR 0032](0032-the-v6-string-is-a-mei-model-with-more-terms.md): The v6 calibration string is a Mei model with more terms, read as radial terms and one tangential pair (provisional)
- [ADR 0033](0033-hdr-is-shown-as-sdr-converted-after-sampling.md): HDR is shown as SDR BT.709, converted in the shader right after a lens is sampled
- [ADR 0034](0034-a-frame-is-timed-half-way-through-its-shutter.md): A frame's gyro time is half way through its shutter, with nothing added for the readout
- [ADR 0035](0035-a-changed-setting-is-drawn-once-an-animation-frame.md): A changed setting is drawn once an animation frame
- [ADR 0036](0036-the-download-plans-again-every-few-mebibytes-read.md): The download plans again every few mebibytes its readers take
- [ADR 0037](0037-an-hevc-codec-string-is-read-from-the-sps-where-the-header-is-blank.md): An HEVC track's codec string is the core's, read from the SPS where the configuration's header is blank
- [ADR 0038](0038-the-picture-stands-as-the-camera-was-mounted.md): The picture stands as the camera was mounted, a quarter turn read from its gravity
- [ADR 0039](0039-the-view-opens-where-studio-centres-the-recording.md): The view opens where Insta360 Studio centres the recording
- [ADR 0040](0040-the-phone-is-a-window-into-the-normal-view.md): The phone is a window into the normal view: motion look turns it by the device's whole attitude
- [ADR 0041](0041-the-pinned-fill-is-shown-in-the-top-layer.md): The pinned fill is shown in the top layer, as a manual popover
- [ADR 0042](0042-the-player-keeps-a-media-elements-promises.md): The player keeps a media element's promises, about a seek, the end, the loop and `play()`
