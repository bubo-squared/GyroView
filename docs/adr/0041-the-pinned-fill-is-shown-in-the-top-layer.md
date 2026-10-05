# ADR 0041: The pinned fill is shown in the top layer, as a manual popover

Status: accepted (2026-10-05)

## Context

Where the browser refuses the Fullscreen API for the element (iPhone Safari has it for nothing
but a video), the element pins itself over the page instead: `data-fill`, a fixed position with
zero insets. A fixed position is the viewport's only while no ancestor makes itself the
containing block of its fixed content, which a transform or a translate, a filter, a
perspective, containment or a `will-change` naming one of them each do. A modal dialog centred
by a translate is the common case: in a dialog of Bubo²'s app the pinned player filled the
dialog, clipped by its overflow, and the page showed around it. An ancestor's stacking context
also caps the fill's `z-index`, so a page's own layer could cover it.

The browser's own fullscreen has neither problem: it shows the element in the top layer, where
the viewport is the containing block and the page's layers lie beneath.

## Decision

The pinned element is a popover as well: `popover="manual"`, shown with `showPopover()`, which
puts it in the top layer. Manual, so the browser neither dismisses it on a tap outside nor on
Escape; the element's own keys and button leave, as before. The fill's styles override a
popover's default border and padding, as they override the page's sizing.

- **Leaving** removes the attribute, which takes the element out of the top layer.
- **A move**: the browser takes a popover out of the top layer when its element leaves the
  document, so a pinned element raises itself again once connected. A page that takes it out of
  the top layer itself (`hidePopover()`) leaves it pinned in place, not hidden: the player's own
  `display: block` outranks the browser's rule that hides a closed popover.
- **A removal**: an element still out of the document a microtask after it left was removed,
  not moved (the rule by which it lets its recording go). It leaves the fill, as the browser's
  fullscreen element does when removed, rather than covering the page again with no gesture
  whenever the page puts it back; a refusal of the Fullscreen API that arrives after a removal
  pins nothing.
- **The page's styles for every popover** outrank the host's own; the fill holds its overflow,
  colours and font as it holds its box.
- **Without popovers of the browser's own** (Safari before 17, which does not parse
  `:popover-open`, whatever a polyfill adds), the element is pinned in place as before.

## Alternatives considered

- **Moving the element to `body` while pinned.** Out of its place it escapes every ancestor, but
  the page's framework would find the node gone from where it rendered it (React's unmount throws
  when it is not there), events would stop reaching the dialog around it, so a dialog library
  would take a tap on the player as one outside and close, and the page's styles for its place
  would no longer reach it.
- **A popover inside the shadow root, around the stage.** The page's styles for `[popover]`
  would not reach it and the element would write no attribute of the browser's. But the
  element would stay in its place while its stage filled the screen: its bounds, and a page's
  `gyro-view[data-fill]` styles, would stop describing the fill. In the browser's fullscreen
  the element itself is the fullscreen one, and the pinned fill stays like it.
- **Asking pages not to transform the player's ancestors.** A modal centred by a translate is
  what most dialog libraries ship; a page cannot be expected to know the fill depends on it.

## Consequences

- The fill covers the viewport from inside any container, above every layer of the page,
  whatever its `z-index`, and follows the viewport when a phone turns.
- A popover or dialog the page opens while the player is pinned shows above it, as it would
  over the browser's fullscreen.
- A style the page gives every `[popover]` reaches the pinned element where the fill does not
  override it, as a page's `:fullscreen` styles reach it in the browser's fullscreen.
- `GyroViewElement.test.ts` pins the element inside a dialog centred by a translate and
  clipping it, under a page layer at the highest `z-index`, beside page styles for every
  popover, after a move into such a dialog and through a resize of the viewport inside one, as
  a phone's turn makes; it removes a pinned element, removes one while the Fullscreen API's
  refusal is on its way, and pins one where the browser has no popovers. Each runs in Chromium
  and WebKit; neither is iOS Safari, which a run on an iPhone is to confirm.
