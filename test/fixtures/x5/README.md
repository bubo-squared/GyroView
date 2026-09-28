# X5 byte slices

Slices cut from two real Insta360 X5 recordings, one made in an office at 5.7K60 (`office`)
and one while sailing at 8K30 (`sailing`); `manifest.json` says where each slice sits in its
file. The parsers are tested against them, and `pnpm fixtures:build` assembles the office
slices into the synthetic recordings in `../synthetic`.

The serial number in each info record is replaced by a placeholder of the same length
(`IAHEAOFFICEXXX`, `IAHEASAILINGXX`), so the slices cannot be traced to a camera while every
offset in the record stays where it was. A slice cut afresh from a recording needs the same
treatment.
