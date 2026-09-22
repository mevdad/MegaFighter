"""
Собирает public/models/warrior3.glb из анимаций Mixamo + меша/текстуры Терракса.

Запуск (нужен Blender 4.x, headless):
    blender --background --python scripts/build-terraks-rig.py

Как добавить новую анимацию:
1. На mixamo.com, с загруженным персонажем Терракс, выбери анимацию → Download →
   Format: FBX Binary, Skin: Without Skin, FPS: 30, Keyframe Reduction: none.
2. Положи файл в assets/rig-source/terraks/.
3. Добавь запись в EXTRA_CLIPS ниже: (имя_файла, имя_клипа_для_кода).
4. Перезапусти скрипт — он пересоберёт warrior3.glb со всеми клипами разом.

MASTER_FBX — особый: единственный файл, который должен нести меш (в первой генерации
это получилось само собой, т.к. Mixamo приложил меш к первой скачанной анимации).
Если в будущем придётся перескачать мастер и Mixamo отдаст его без меша — качай в
режиме "With Skin" один раз и подставь этот файл сюда.
"""
import bpy
import os

SOURCE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "assets", "rig-source", "terraks")
OUT_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "public", "models", "warrior3.glb")

MASTER_FBX = "Punching_1.fbx"
MASTER_CLIP_NAME = "punch_body"

EXTRA_CLIPS = [
    ("Martelo_2.fbx", "kick_high"),
]

TEXTURE_FILE = "diffuse.png"


def fix_mixamo_scale(armature_obj):
    """Mixamo FBX бэйкает object-level scale=0.01 на арматуре (см-vs-м юниты в FBX).
    Возвращаем к метрам так же, как это сделал бы человек руками в Blender:
    выделить меш+арматуру вместе, resize x100 вокруг общего центра, затем Apply Scale.
    Так parent/child трансформы остаются согласованными (в отличие от прямой правки
    object.scale, которая ломается через matrix_parent_inverse)."""
    bpy.ops.object.select_all(action='DESELECT')
    for obj in bpy.data.objects:
        if obj.type in ('ARMATURE', 'MESH'):
            obj.select_set(True)
    bpy.context.view_layer.objects.active = armature_obj
    bpy.ops.transform.resize(value=(100, 100, 100))
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)

    # --- Мастер: меш + скелет + первая анимация ---
    bpy.ops.import_scene.fbx(filepath=os.path.join(SOURCE_DIR, MASTER_FBX))
    master_armature = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
    mesh_obj = next(o for o in bpy.data.objects if o.type == 'MESH')
    fix_mixamo_scale(master_armature)
    print(f"Master mesh dims after scale fix: {tuple(mesh_obj.dimensions)}")

    master_action = bpy.data.actions[0]
    master_action.name = MASTER_CLIP_NAME
    master_action.use_fake_user = True
    print(f"Master clip: {master_action.name} ({master_action.frame_range[1]} frames)")

    # --- Материал + текстура (меш пришёл вообще без материалов) ---
    mat = bpy.data.materials.new(name="TerraxSkin")
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    tex_node = mat.node_tree.nodes.new("ShaderNodeTexImage")
    tex_node.image = bpy.data.images.load(os.path.join(SOURCE_DIR, TEXTURE_FILE))
    uv_node = mat.node_tree.nodes.new("ShaderNodeUVMap")
    uv_node.uv_map = mesh_obj.data.uv_layers[0].name
    mat.node_tree.links.new(uv_node.outputs["UV"], tex_node.inputs["Vector"])
    mat.node_tree.links.new(tex_node.outputs["Color"], bsdf.inputs["Base Color"])
    mesh_obj.data.materials.append(mat)
    for poly in mesh_obj.data.polygons:
        poly.material_index = 0

    # --- Дополнительные анимации: только скелет, Action переносим на мастер-арматуру ---
    # (Bone-локальные fcurves не зависят от object-level scale, поэтому scale-фикс
    # для этих временных арматур не нужен — берём Action как есть.)
    for fname, clip_name in EXTRA_CLIPS:
        existing = set(bpy.data.objects)
        bpy.ops.import_scene.fbx(filepath=os.path.join(SOURCE_DIR, fname))
        new_objs = [o for o in bpy.data.objects if o not in existing]
        temp_armature = next(o for o in new_objs if o.type == 'ARMATURE')

        action = temp_armature.animation_data.action
        action.name = clip_name
        action.use_fake_user = True
        print(f"Extra clip: {action.name} ({action.frame_range[1]} frames, from {fname})")

        for o in new_objs:
            bpy.data.objects.remove(o, do_unlink=True)

    # --- Плейсхолдер-стойка: idle/run/hit пока не сгенерированы отдельно в Mixamo,
    # держим bind-позу двумя кадрами, чтобы AnimatedRig (требует все поля) не падал
    # и было на чём стоять между ударами. Заменить на реальные клипы, когда появятся. ---
    idle_action = bpy.data.actions.new(name="idle_hold")
    idle_action.use_fake_user = True
    master_armature.animation_data.action = idle_action
    for pbone in master_armature.pose.bones:
        for frame in (0, 10):
            pbone.keyframe_insert(data_path="location", frame=frame)
            pbone.keyframe_insert(data_path="rotation_quaternion", frame=frame)
            pbone.keyframe_insert(data_path="scale", frame=frame)
    master_armature.animation_data.action = master_action

    # --- Экспорт: все Action'ы отдельными именованными клипами в одном GLB ---
    bpy.ops.object.select_all(action='SELECT')
    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=OUT_PATH,
        export_format='GLB',
        use_selection=True,
        export_animation_mode='ACTIONS',
        export_materials='EXPORT',
        export_texcoords=True,
        export_skins=True,
    )
    print(f"Exported: {OUT_PATH}")


main()
