# Hyprland Lua config: the common options

Checked against Hyprland 0.56. For anything not here, query context7's `/hyprwm/hyprland-wiki`.

## How values are written

```lua
hl.config({
    general = {
        gaps_in = 3,                                  -- integer
        col = {
            active_border = { colors = { "rgba(82dcccff)", "rgba(007d6fff)" }, angle = 45 },  -- gradient
            inactive_border = "rgba(798bb2ff)",       -- one colour
        },
    },
    decoration = { rounding = 10, blur = { size = 6 } },
})
```

- In `hypr_preview` and `hypr_check`, the same option is dotted: `general.col.active_border`, `decoration.blur.size`.
- Colours: `"rgba(rrggbbaa)"` or `"rgb(rrggbb)"` (hex), or a colour variable the config defines (`CACHYLGREEN`).
  Variables only exist in the files; in `hypr_preview`, give the colour itself.
- Gaps (`gaps_in`, `gaps_out`): one integer, or per side in the file as `{ top = 5, right = 10, bottom = 5, left = 10 }`
  (that form can't be previewed).
- A vec2 such as `decoration.shadow.offset`: `"x y"`, e.g. `"0 4"`.
- Several `hl.config` calls may set options. The last one to set an option wins, so change the existing line.

## general

| Option | Type | What it does |
|---|---|---|
| `gaps_in` | int | Space between windows |
| `gaps_out` | int | Space between windows and the screen edge |
| `border_size` | int | Border width; 0 hides borders |
| `col.active_border` | gradient | Focused window's border |
| `col.inactive_border` | gradient | Other windows' borders |
| `resize_on_border` | bool | Drag a border to resize |
| `layout` | string | `dwindle` or `master` |

## decoration

| Option | Type | What it does |
|---|---|---|
| `rounding` | int | Corner radius in pixels, 0 to 100 |
| `rounding_power` | float | Corner curve, 1.0 to 10.0: 2.0 is a circle, 4.0 a squircle |
| `active_opacity` | float | Focused window's opacity, 0.0 to 1.0 |
| `inactive_opacity` | float | Other windows' opacity |
| `fullscreen_opacity` | float | Fullscreen window's opacity |
| `dim_inactive` | bool | Darken windows that aren't focused |
| `dim_strength` | float | How much, 0.0 to 1.0 |
| `dim_special` | float | Dimming behind the special workspace |
| `blur.enabled` | bool | Blur behind see-through windows |
| `blur.size` | int | Blur radius |
| `blur.passes` | int | More passes is smoother and costs more GPU |
| `blur.vibrancy` | float | Colour saturation of the blur, 0.0 to 1.0 |
| `blur.noise` | float | Grain, 0.0 to 1.0 |
| `blur.contrast` / `blur.brightness` | float | 0.0 to 2.0 |
| `blur.xray` | bool | Floating windows blur only the wallpaper |
| `blur.popups` / `blur.special` | bool | Blur popups / the special workspace |
| `shadow.enabled` | bool | Window shadows |
| `shadow.range` | int | Shadow size |
| `shadow.render_power` | int | Falloff, 1 to 4 |
| `shadow.color` | colour | Shadow colour |
| `shadow.offset` | vec2 | Shadow shift, `"x y"` |

## animations

`animations.enabled` (bool) turns every animation on or off. Each animation is its own call in `animations.lua`:

```lua
hl.curve("quick", { type = "bezier", points = { {0.15, 0}, {0.1, 1} } })
hl.curve("easy",  { type = "spring", mass = 1, stiffness = 500, dampening = 35 })
hl.animation({ leaf = "windows", enabled = true, speed = 3, spring = "easy", style = "slide" })
```

- `leaf`: `global`, `windows` (`windowsIn`, `windowsOut`, `windowsMove`), `layers` (`layersIn`, `layersOut`),
  `fade` (`fadeIn`, `fadeOut`, `fadeSwitch`, `fadeShadow`, `fadeDim`, `fadeLayers`, `fadePopups`), `border`,
  `borderangle`, `workspaces` (`workspacesIn`, `workspacesOut`), `specialWorkspace` (`specialWorkspaceIn`,
  `specialWorkspaceOut`), `zoomFactor`, `monitorAdded`. A leaf without its own line follows its parent.
- `speed`: tenths of a second, so lower is faster.
- `bezier` or `spring` (one is required): a curve name the file defines with `hl.curve`, or `default`. The wiki
  writes `curve = "…"`, which Hyprland 0.56 refuses: use `bezier` or `spring`.
- `style`: for windows `slide` (or `slide left|right|top|bottom`) and `popin 80%`; for workspaces `slide`,
  `slidevert`, `fade` and `slidefade 20%`.

`hypr_preview`'s `animations` takes the same fields (leaf, enabled, speed, bezier or spring, style). A new curve has
to be written into the file first.

## misc

| Option | Type | What it does |
|---|---|---|
| `disable_hyprland_logo` | bool | Hide the logo on the empty background |
| `disable_splash_rendering` | bool | Hide the splash text |
| `background_color` | colour | Background behind the wallpaper |
| `disable_autoreload` | bool | Leave it false: saving a file reloads the config |
