# ADR 0028: The controls fit the player's width and the pointer

Status: accepted (2026-09-29)

## Context

The control bar was restyled: a shaded bar over the bottom of the picture, a thin seek bar, and
icon buttons, among them Stabilization and View, which show the icon of the choice in effect and
open a menu listing the choices with their icons, names and a line describing each. The element
is embedded in pages it knows nothing of: a phone column 360 pixels wide, a sidebar, a
full-width hero, a tablet. A bar that fits a wide player does not fit a narrow one, and a finger
needs larger targets than a mouse on a player of any width.

## Decision

- **The player's width decides what the bar shows**, through container queries on the stage,
  never the page's viewport. Below 37.5rem the bar gives up the volume slider and shows the menus
  over the whole player, with a close button and 44-pixel rows without descriptions. Narrower
  still it gives up the time, then Reset view. Each width is where the bar stops fitting with the
  part, measured with stabilization offered and times up to an hour, in rem so larger page text
  moves it; a test checks the bar at each width at two text sizes.
- **The pointer decides the targets.** A coarse pointer makes every target 44 pixels and leaves
  the volume to the device's buttons; its larger targets move each narrowing width out. It does
  not by itself make the menus cover the player: on a wide tablet a popover is enough.
- **The setting buttons show icons and are named in words.** Each is named, through
  `aria-labelledby`, by what it sets and the name of the choice in effect ("View
  Equirectangular"), words it never shows, which a hidden element still gives. The choices'
  icons are records by mode, so a new mode cannot be left without one, and the menus list the
  modes in the core's order.
- **Reset view stays in every view mode.** The raw lenses zoom and move too (ADR 0018), and the
  button is their way back to the fitted picture for a visitor who knows no keys.
- **The theme stays the page's.** The design's colours are the defaults of the custom
  properties, the accent now white; secondary words, fills and tracks are the text colour at
  lower strengths, so a page that changes the text colour changes them with it. A menu without
  a blur behind it, or for a viewer who asked for less transparency, is its own colour laid
  twice over itself, near enough opaque; forced colours keep the sliders' track and handle and
  the menus' edges in system colours.

## Alternatives considered

- Setting buttons that say what they set and the choice in effect in words: they took a third
  of a wide bar, and a narrow player needed short names and then icons anyway.
- One breakpoint at 600 pixels for everything: the narrowest players still overflowed.
- The compact layout on every touch device: menus covering a large tablet player.
- `aria-label` written from the words in code: the same name, with a second way of filling in
  words beside the one every other label uses.
- Hiding Reset view in the raw lenses, as the stabilization menu is hidden there: stabilization
  changes nothing in the raw lenses, but their zoom does need undoing.

## Consequences

The bar fits every player from 13.5rem wide with a mouse and 16rem with a finger. A page that
set only `--gyro-view-accent` and `--gyro-view-radius` keeps its colour and corners. The Stop
button is gone; `stop()` and the S key remain.
