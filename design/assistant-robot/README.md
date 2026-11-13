# Headphone assistant model

Offline authoring sources for the project-owned assistant launcher. The generated
Agent App receives rendered WebP body atlases, projected SVG face paths and a complete PNG
still; it imports no 3D
engine, modelling tool, Python code or image-registration implementation.

- `assistant-robot.glb`: editable complete mesh model, materials, textures and a
  32-second turn/blink animation. The body, curved screen, headphone arch,
  segmented cushions, earcups, hearts and eyes are separate geometry.
- `model.mjs`: model construction. `appearance.jpg`, `rear-appearance.jpg` and
  `body-atlas.jpg` retain the reference-guided appearance. These are baked
  material textures on the solid model, not alternate-view crossfades.
- `animation.mjs`: quiet holds, smooth turns through the front to the opposite
  side, and independent blinks. The same model renders every intermediate view.
- `render.html` / `render.mjs`: offline Three.js 0.186.1 render/export pipeline,
  using the repository's Playwright installation. Three.js is not added to any
  production frontend dependency.
- `bake-textures.py`: optional offline atlas rebake (Pillow, NumPy and OpenCV).
- `encode-animation.py`: offline WebP atlas/still export (Pillow).

From the repository root, with an extracted official `three@0.186.1` npm package:

```text
node design/assistant-robot/render.mjs --three-root <three-package-directory> --output <frames-directory>
python3 design/assistant-robot/encode-animation.py <frames-directory> packages/plugins/resources/registry/items/foundation/shell-assistant/files/application/shell
```

The encoder checks the per-resource size limit and splits atlas pages to fit. Model authoring files are not part of the Bootstrap runtime template.
The shipping preset uses 192-pixel body views at WebP quality 85 for the 80-pixel
launcher, covering 2× density without enlarging the source images.
Eyes and mouth are excluded from the body images. The complete 192-pixel
PNG fallback retains its face in case atlas loading fails.
The model is reconstructed from the supplied reference images, not the original
artist's 3D source; visual likeness must be evaluated separately from mesh validity.

Interactive views use 57 yaw angles and 13 frontal pitch angles of the same
model. One shared frontal render leaves 69 unique body images.
Eye silhouettes and blink axes follow the curved display surface rather
than a protruding capsule. Smile curves and the mouth are projected from those
surface-attached meshes through the same camera for each view. The SVG face follows the selected body
view, with continuous eyelid scaling in the projected surface axes and independent
smile eyes. A projected screen mask clips the facial glow to the display. Shared frontal
renders and vector paths connect both banks without blending.

Idle holds occupy about 84 percent of a 32-second cycle, with two short turns.
Soft vertical floating remains visible during the holds. The small motion
controller handles hover dwell, delayed leave, alternating tilt, click nods,
working glances and a single success response. Run state and successful completion
come from the existing public conversation APIs; cancellation and errors do not
celebrate. No engine is shipped to the App.

```text
node design/assistant-robot/render.mjs --three-root <three-package-directory> --output <new-frames-directory> --interactive true
python3 design/assistant-robot/encode-animation.py <new-frames-directory> packages/plugins/resources/registry/items/foundation/shell-assistant/files/application/shell
```

Use a fresh output directory when switching between idle-loop and interactive
exports; `poses.json` identifies the interactive bank to the encoder. The GLB
contains the base idle animation. `faces.json` contains camera-projected vector
expressions and `poster.png` contains the complete fallback. The encoder ships
body-only atlas pages and includes those SVG paths in the frame metadata. It
trims unused rows of the last page to avoid decoding empty pixels.
