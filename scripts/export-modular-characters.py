"""Run in Blender 4.3, with the official Humans_Master.blend already open.

blender --background --disable-autoexec Humans_Master.blend \
  --python scripts/export-modular-characters.py -- /absolute/output/characters.glb

Keeps the shared rig and all original actions. Bakes flat material colors into
vertices so each visible module needs only one material/draw, not one per color.
"""
import bpy
import sys
from pathlib import Path

destination = Path(sys.argv[sys.argv.index("--") + 1])
destination.parent.mkdir(parents=True, exist_ok=True)
for name in ("Pistol", "Sword"):
    obj = bpy.data.objects.get(name)
    if obj:
        bpy.data.objects.remove(obj, do_unlink=True)

material = bpy.data.materials.new("Quaternius vertex palette")
material.use_nodes = True
bsdf = material.node_tree.nodes.get("Principled BSDF")
bsdf.inputs["Roughness"].default_value = 0.9
vertex = material.node_tree.nodes.new("ShaderNodeVertexColor")
vertex.layer_name = "Color"
material.node_tree.links.new(vertex.outputs["Color"], bsdf.inputs["Base Color"])

for obj in bpy.data.objects:
    obj.hide_set(False)
    obj.hide_viewport = False
    obj.hide_render = False
    if obj.type != "MESH":
        continue
    mesh = obj.data
    colors = []
    for slot in obj.material_slots:
        source = slot.material
        node = source.node_tree.nodes.get("Principled BSDF") if source and source.use_nodes else None
        colors.append(tuple(node.inputs["Base Color"].default_value) if node else tuple(source.diffuse_color))
    attribute = mesh.color_attributes.new(name="Color", type="FLOAT_COLOR", domain="CORNER")
    for polygon in mesh.polygons:
        color = colors[polygon.material_index] if colors else (0.7, 0.7, 0.7, 1)
        for loop in polygon.loop_indices:
            attribute.data[loop].color = color
        polygon.material_index = 0
    mesh.materials.clear()
    mesh.materials.append(material)

armature = bpy.data.objects["CharacterArmature"]
armature.animation_data_create()
armature.animation_data.action = bpy.data.actions.get("Idle")
bpy.context.scene.frame_set(1)
bpy.ops.export_scene.gltf(
    filepath=str(destination), export_format="GLB", use_selection=False,
    export_animations=True, export_animation_mode="ACTIONS",
    export_force_sampling=True, export_skins=True, export_apply=True,
    export_vertex_color="MATERIAL", export_materials="EXPORT",
    export_yup=True, export_cameras=False, export_lights=False,
)
print("Exported modular character kit:", destination)
