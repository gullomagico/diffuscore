# Opinionated defaults, customisable by the performer

Acousmatic diffusion has no dominant software or shared convention for how a diffusion score should look or behave, and performers' practices differ widely. DiffuScore therefore ships opinionated defaults, chosen so a new performer is well served without touching anything, but lets the performer customise how they experience the app wherever a choice is a matter of practice or taste rather than correctness. Customisations are saved across launches as preferences.

The first case: how Follow moves the Visible Range is a per-mode preference (page turn by default in Editor mode, continuous scrolling by default in Performance mode), and so is the Playhead's position during continuous scrolling.

## Considered Options

- **One fixed behaviour per mode**: simpler to build, test and document, but imposes one performer's habits on everyone in a field with no standard to justify it.

## Consequences

- Each new behaviour should ask whether it is a matter of practice (make it a preference with a good default) or a technical limit (keep it fixed). For example, the deepest Zoom is fixed because it follows from the analysis resolution.
- Preferences accumulate; they need a single, well-organised home (the Preferences window) and must never be required to get started.
