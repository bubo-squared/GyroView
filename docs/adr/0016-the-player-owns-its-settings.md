# ADR 0016: The player owns its settings; attributes configure them

Status: accepted (2026-09-26)

## Context

A setting (stabilization, view mode, view angles, sound, loop) reached the player four ways:
an attribute change, the attributes read again on every reload, the settings menu, keyboard
and gestures calling the player directly, and the embed bridge writing attributes or calling
methods. A reload trusted only the attributes. With
`<gyro-view stabilization="horizon" muted yaw="30">`, a viewer who chose Off in the menu,
unmuted and dragged the view got horizon, mute and yaw 30 back as soon as a change of quality
reloaded the recording. The read side had the same fault: the element's properties mirrored
the attributes, so `stabilization` read `null` when no attribute was set and stayed stale after
a menu choice, and the bridge's `getState` reported that value.

## Decision

The `Player` is the single owner of the settings, which carry over from load to load.

- **Attributes are commands.** Each settings attribute is applied when it changes, including
  when the element is created with it; a view attribute changes only the angle it names. A
  reload reads the source and the per-load options (`autoplay`, `preload`) and nothing else,
  and `LoadOptions` carries only those.
- **Settings properties report the setting in effect**, the way `HTMLMediaElement.muted` does:
  `stabilization`, `viewMode`, `fov`, `yaw`, `pitch`, `muted`, `loop` and `volume` read the
  player and write to it, and refuse a value the setting cannot take with `invalid-argument`.
  Properties of the other attributes (`src`, `src2`, `poster`, `preload`, `gain-match`,
  `autoplay`, `controls`) still mirror their attributes, as `img.src` does.
- **Hosts read the player's state.** The bridge's `getState` and the developer page read the
  live properties; no attribute is cast into a setting.

## Alternatives considered

- Writing every change back to the attributes, so that they always hold the truth: a drag
  would rewrite `yaw` and `pitch` on every pointer move, wake every mutation observer on the
  page and feed attribute callbacks back into the player.
- Reading the attributes again on reload, as before: the defect above.
- Mirroring attributes and adding `current*` properties for the live values: two names for
  every setting, where the media element already set the convention.

## Consequences

After a change from the menu, keyboard, gestures or script, an attribute can differ from the
property of the same name, exactly as `<video muted>` can differ from `video.muted`. Removing
a choice attribute (`stabilization`, `view-mode`) leaves the setting as it is; removing
`muted` or `loop` turns it off, as for any boolean attribute. Unsetting a setting's property, as
a framework does with a prop it no longer passes (`undefined`, `null` or `''`), leaves it as it
is too; any other value it cannot take is refused. A headless `Player` user sets the
settings on the player before or after `load`.
