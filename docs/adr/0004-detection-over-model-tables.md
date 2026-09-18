# ADR 0004: Select format variants from the file, not from the camera model

Status: accepted (2026-09-18)

## Context

Only two X5 recordings are available locally, yet the player must accept X3, X4 and X5 files.
The trailer, calibration, gyro and layout all have documented variants across firmware
generations that do not align cleanly with model names.

## Decision

Every variant is selected from evidence inside the file: trailer wrapper from the box scan;
record access from the id of the header before the footer; calibration version from the token
count and version word; gyro sample layout from `is_raw_gyro` or the payload size; frame timing
source from `pts_type` and record presence; lens layout from protobuf field 79, track count and
aspect ratio. The model string may seed a default (IMU axis orientation) that data then verifies.
Variants without a real sample are covered by synthetic fixtures and marked "verify on real file".

## Consequences

More parsing code paths and fixtures up front; no silent breakage when an unseen camera writes
a known variant. A camera writing an unknown variant fails with a typed error naming it.
