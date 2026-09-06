"""Blender mesh helpers. Sirf `bpy`/`bmesh` par nirbhar -- koi pip package nahi.

Blender ki apni bundled Python hoti hai, isliye tools/requirements.txt ke
packages yahan available nahi hote. Sab kuch stdlib + bpy se.
"""

from __future__ import annotations

import math

import bmesh
import bpy


def new_mesh_object(name: str, collection: bpy.types.Collection) -> bpy.types.Object:
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    return obj


def get_or_create_collection(name: str) -> bpy.types.Collection:
    if name in bpy.data.collections:
        return bpy.data.collections[name]
    col = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(col)
    return col


def clear_scene() -> None:
    """Scene khaali karo. Headless batch runs ke liye zaroori."""
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for block in (bpy.data.meshes, bpy.data.materials, bpy.data.objects):
        for item in list(block):
            if item.users == 0:
                block.remove(item)


def flat_material(name: str, rgb: tuple[float, float, float]) -> bpy.types.Material:
    """Ek saada matte material. Game ka art style flat-shaded low-poly hai,
    isliye koi texture nahi -- sirf base colour."""
    if name in bpy.data.materials:
        return bpy.data.materials[name]
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = (*rgb, 1.0)
        bsdf.inputs["Roughness"].default_value = 0.9
        if "Specular IOR Level" in bsdf.inputs:        # Blender 4.x
            bsdf.inputs["Specular IOR Level"].default_value = 0.15
    return mat


def extrude_polygon(bm: bmesh.types.BMesh, ring: list[tuple[float, float]],
                    base_z: float, height: float) -> list[bmesh.types.BMFace]:
    """Ek 2D ring ko upar extrude karo. Ring (x, z) metres mein.

    Blender Z-up hai aur game Y-up, isliye yahan mapping (x, z) -> (X, Y) hai
    aur oonchai Z par jaati hai. Export ke waqt axis conversion ho jaata hai.
    """
    verts = [bm.verts.new((x, z, base_z)) for x, z in ring]
    bm.verts.ensure_lookup_table()
    try:
        face = bm.faces.new(verts)
    except ValueError:          # duplicate/degenerate ring
        return []
    res = bmesh.ops.extrude_face_region(bm, geom=[face])
    moved = [e for e in res["geom"] if isinstance(e, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, vec=(0.0, 0.0, height), verts=moved)
    return [f for f in res["geom"] if isinstance(f, bmesh.types.BMFace)]


def shade_flat(obj: bpy.types.Object) -> None:
    for poly in obj.data.polygons:
        poly.use_smooth = False


def uv_smart_project(obj: bpy.types.Object, angle: float = math.radians(66)) -> None:
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.uv.smart_project(angle_limit=angle, island_margin=0.02)
    bpy.ops.object.mode_set(mode="OBJECT")
    obj.select_set(False)


def export_glb(objects: list[bpy.types.Object], path: str) -> None:
    """glTF binary export.

    glTF isliye ki Three.js aur Godot **dono** ise natively load karte hain --
    yahi ek format teeno tools ko jodta hai (FBX dono mein utna seedha nahi).
    """
    bpy.ops.object.select_all(action="DESELECT")
    for o in objects:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objects[0] if objects else None
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,          # Blender Z-up -> glTF/game Y-up
    )
