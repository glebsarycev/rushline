# Nature models

`assets/models/nature.js` holds five low-poly models made with Higgsfield: a picture of
each object (GPT Image 2.5), lifted to a textured GLB (SAM 3 3D Objects), then
simplified and baked by `bake.py` (one colour per face, unit height, base at y = 0,
int16 positions). The game draws them as instanced meshes (`src/render/nature.js`).

    python bake.py ../../assets/models/nature.js autumn:1100 green:1100 cherry:1300 pine:700 rock:800

(needs trimesh, fast-simplification, scipy; the source GLBs are not kept in the repo)
